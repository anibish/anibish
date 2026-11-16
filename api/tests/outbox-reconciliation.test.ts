import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import nodemailer from 'nodemailer';
import {pool} from '../db';
import {runOutboxBatch} from '../worker';
import {registerNotificationEvents} from '../notifications';
import type {DomainContext} from '../context';

const created:string[]=[];
before(async()=>{
 if(!process.env.DATABASE_URL?.includes('anibish_qa'))throw new Error('Outbox tests require an isolated anibish_qa database.');
 await pool.query('SELECT delivery_status FROM outbox LIMIT 0');
 await pool.query('SELECT fingerprint FROM notification_events LIMIT 0');
});
after(async()=>{
 if(created.length){await pool.query('DELETE FROM notification_events WHERE outbox_id=ANY($1::uuid[])',[created]);await pool.query('DELETE FROM outbox WHERE id=ANY($1::uuid[])',[created]);}
 await pool.end();
});
async function job(status='retry',provider='not_confirmed'){
 const [r]=(await pool.query("INSERT INTO outbox(recipient,template,payload,status,delivery_status,attempts,last_error) VALUES($1,'welcome',$2,$3,$4,1,'PREVIOUS_FAILURE') RETURNING id",['outbox-'+randomUUID()+'@example.test',JSON.stringify({body:'Isolated transport fixture. No email is sent.'}),status,provider])).rows;
 created.push(r.id);return String(r.id);
}
async function evidence(id:string,event='delivered'){
 await pool.query('INSERT INTO notification_events(fingerprint,outbox_id,event,recipient,provider_message_id,event_at) SELECT $1,id,$2,recipient,$3,now() FROM outbox WHERE id=$4',[randomUUID(),event,'<receipt-'+randomUUID()+'@provider.test>',id]);
}
function localTransport(){
 let calls=0;
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true});
 transport.use('compile',(_mail,callback)=>{calls++;callback()});
 return {transport,calls:()=>calls};
}

test('queued retries with accepted or delivered provider state are reconciled without sending',async()=>{
 for(const state of ['request','sent','delivered']){
  const id=await job('retry',state),mock=localTransport();
  assert.equal((await runOutboxBatch(mock.transport,id)).sent,0);
  assert.equal(mock.calls(),0,state);
  const r=(await pool.query('SELECT status,delivery_status,sent_at,last_error,locked_at,attempts FROM outbox WHERE id=$1',[id])).rows[0];
  assert.equal(r.status,'sent');assert.equal(r.delivery_status,state);assert.ok(r.sent_at);assert.equal(r.last_error,null);assert.equal(r.locked_at,null);assert.equal(r.attempts,1);
 }
});

test('stored authenticated acceptance history prevents resend even if later state differs',async()=>{
 const id=await job('retry','error');await evidence(id);const mock=localTransport();
 assert.equal((await runOutboxBatch(mock.transport,id)).sent,0);assert.equal(mock.calls(),0);
 const r=(await pool.query('SELECT status,delivery_status FROM outbox WHERE id=$1',[id])).rows[0];
 assert.equal(r.status,'sent');assert.equal(r.delivery_status,'error','Transport acceptance reconciliation must not invent successful final delivery.');
});

test('unconfirmed pending messages still make one isolated transport attempt',async()=>{
 const id=await job('pending'),mock=localTransport();
 assert.equal((await runOutboxBatch(mock.transport,id)).sent,1);assert.equal(mock.calls(),1);
 assert.equal((await runOutboxBatch(mock.transport,id)).sent,0);assert.equal(mock.calls(),1);
 const r=(await pool.query('SELECT status,delivery_status,delivery_id FROM outbox WHERE id=$1',[id])).rows[0];
 assert.equal(r.status,'sent');assert.equal(r.delivery_status,'not_confirmed');assert.ok(r.delivery_id);
});

test('acceptance receipt arriving during a failed transport attempt cannot requeue the message',async()=>{
 const id=await job('pending');let calls=0;
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true});
 transport.use('compile',(_mail,callback)=>{calls++;void evidence(id,'sent').then(()=>callback(Object.assign(new Error('Isolated synthetic failure'),{code:'EAUTH',command:'AUTH'}))).catch(callback)});
 assert.equal((await runOutboxBatch(transport,id)).sent,0);assert.equal(calls,1);
 const r=(await pool.query('SELECT status,last_error FROM outbox WHERE id=$1',[id])).rows[0];
 assert.equal(r.status,'sent');assert.equal(r.last_error,null);
 assert.equal((await runOutboxBatch(transport,id)).sent,0);assert.equal(calls,1);
});

test('owner retry rejects acceptance evidence while known unconfirmed failure remains retryable',async()=>{
 const app=Fastify();
 app.setErrorHandler((error,_req,reply)=>reply.code((error as {statusCode?:number}).statusCode||500).send({error:(error as Error).message}));
 const actor={id:randomUUID(),email:'outbox-owner@example.test',name:'Outbox QA',global_role:'super_admin',org_id:randomUUID(),role:'owner',mfa_enabled:true,mfa_verified:true};
 const context:DomainContext={actor:async()=>actor,staff:()=>true,scope:()=>({sql:'TRUE',args:[]}),getScoped:async()=>{throw new Error('Unused fixture method')},audit:async()=>{},notify:async()=>{}};
 try{
  await registerNotificationEvents(app,context);
  for(const provider of ['request','sent','delivered']){
   const id=await job('failed',provider);const response=await app.inject({method:'POST',url:'/notification-operations/'+id+'/retry',payload:{confirmed:true}});
   assert.equal(response.statusCode,409,response.body);
  }
  const late=await job('failed','error');await evidence(late,'sent');
  assert.equal((await app.inject({method:'POST',url:'/notification-operations/'+late+'/retry',payload:{confirmed:true}})).statusCode,409);
  const fresh=await job('failed');const response=await app.inject({method:'POST',url:'/notification-operations/'+fresh+'/retry',payload:{confirmed:true}});
  assert.equal(response.statusCode,200,response.body);
  assert.equal((await pool.query('SELECT status FROM outbox WHERE id=$1',[fresh])).rows[0].status,'retry');
 }finally{await app.close()}
});


test('authenticated late provider callbacks reconcile unknown acceptance without claiming final delivery',async()=>{
 const app=Fastify();
 app.setErrorHandler((error,_req,reply)=>reply.code((error as {statusCode?:number}).statusCode||500).send({error:(error as Error).message}));
 const actor={id:randomUUID(),email:'callback-owner@example.test',name:'Callback QA',global_role:'super_admin',org_id:randomUUID(),role:'owner',mfa_enabled:true,mfa_verified:true};
 const context:DomainContext={actor:async()=>actor,staff:()=>true,scope:()=>({sql:'TRUE',args:[]}),getScoped:async()=>{throw new Error('Unused fixture method')},audit:async()=>{},notify:async()=>{}};
 const previous=process.env.ANIBISH_BREVO_WEBHOOK_TOKEN;process.env.ANIBISH_BREVO_WEBHOOK_TOKEN=randomUUID()+randomUUID();
 try{
  await registerNotificationEvents(app,context);
  for(const [queue,event] of [['unknown','request'],['failed','delivered']] as const){
   const id=await job(queue),row=(await pool.query('SELECT recipient FROM outbox WHERE id=$1',[id])).rows[0];
   const payload={event,email:row.recipient,'message-id':'accepted-'+randomUUID(),'X-Mailin-custom':'anibish_outbox_id:'+id,ts_event:Math.floor(Date.now()/1000)};
   const callback=()=>app.inject({method:'POST',url:'/notifications/webhooks/brevo',headers:{authorization:'Bearer '+process.env.ANIBISH_BREVO_WEBHOOK_TOKEN},payload});
   const response=await callback();assert.equal(response.statusCode,200,response.body);assert.equal(response.json().accepted,1);
   const r=(await pool.query('SELECT status,delivery_status,last_error,sent_at FROM outbox WHERE id=$1',[id])).rows[0];
   assert.equal(r.status,'sent');assert.equal(r.delivery_status,event);assert.equal(r.last_error,null);assert.ok(r.sent_at);
   assert.equal((await callback()).json().duplicates,1);
   const mock=localTransport();assert.equal((await runOutboxBatch(mock.transport,id)).sent,0);assert.equal(mock.calls(),0);
  }
 }finally{if(previous===undefined)delete process.env.ANIBISH_BREVO_WEBHOOK_TOKEN;else process.env.ANIBISH_BREVO_WEBHOOK_TOKEN=previous;await app.close()}
});
