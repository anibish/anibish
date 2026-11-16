import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {totp} from '../security';

let app:Awaited<ReturnType<typeof buildServer>>;
const suffix=randomUUID().slice(0,8),password='Local-task-privacy-'+randomUUID();
const headers={'x-studio-client':'web',origin:'http://localhost:3000','content-type':'application/json'};
const ip='127.39.'+parseInt(suffix.slice(0,2),16)+'.'+parseInt(suffix.slice(2,4),16);
async function call(method:'GET'|'POST'|'PATCH',url:string,body:unknown={},cookie=''){
 return app.inject({method,url,remoteAddress:ip,headers:{...headers,...(cookie?{cookie}:{})},...(method==='GET'?{}:{payload:JSON.stringify(body)})});
}
async function account(name:string){
 const email=`task-privacy-${name}-${suffix}@example.test`;
 const created=await call('POST','/auth/register',{name,email,password,organization:'Isolated task privacy '+suffix});
 assert.equal(created.statusCode,201,created.body);
 const token=new URL('http://localhost'+created.json().development_link).searchParams.get('token');
 assert.equal((await call('POST','/auth/token',{token})).statusCode,200);
 const login=await call('POST','/auth/login',{email,password});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;
 return {cookie,user,email};
}
let owner:Awaited<ReturnType<typeof account>>,customer:typeof owner,otherCustomer:typeof owner;
let projectId:string;
before(async()=>{
 if(!process.env.DATABASE_URL?.includes('anibish_qa'))throw Error('Task privacy tests require the dedicated anibish_qa database.');
 await migrate();app=await buildServer();
 owner=await account('owner');customer=await account('customer');otherCustomer=await account('other-customer');
 await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[owner.user.id]);
 const setup=(await call('POST','/auth/mfa/setup',{},owner.cookie)).json();
 assert.equal((await call('POST','/auth/mfa/verify',{code:totp(setup.secret)},owner.cookie)).statusCode,200);
 const project=await call('POST','/projects',{title:'Task privacy fixture '+suffix,org_id:customer.user.org_id},owner.cookie);
 assert.equal(project.statusCode,200,project.body);projectId=project.json().id;
});
after(async()=>{await app?.close();await pool.end();});

async function task(title:string,internal:boolean){
 const saved=await call('POST','/tasks',{title,description:'Isolated QA task',project_id:projectId,internal},owner.cookie);
 assert.equal(saved.statusCode,200,saved.body);return saved.json();
}
async function noticeCounts(marker:string){
 return {
  notifications:Number((await pool.query('SELECT count(*) FROM notifications WHERE body LIKE $1',['%'+marker+'%'])).rows[0].count),
  outbox:Number((await pool.query("SELECT count(*) FROM outbox WHERE payload->>'body' LIKE $1",['%'+marker+'%'])).rows[0].count),
 };
}

test('internal task creation and updates persist privately without notifications or email jobs',async()=>{
 const marker='INTERNAL-'+suffix,created=await task(marker+' original',true);
 assert.deepEqual(await noticeCounts(marker),{notifications:0,outbox:0});
 const updated=await call('PATCH','/tasks/'+created.id,{title:marker+' edited',description:'Private engineering details',status:'doing'},owner.cookie);
 assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().internal,true);
 assert.deepEqual(await noticeCounts(marker),{notifications:0,outbox:0});
 const persisted=(await pool.query('SELECT title,description,status,internal FROM tasks WHERE id=$1',[created.id])).rows[0];
 assert.deepEqual(persisted,{title:marker+' edited',description:'Private engineering details',status:'doing',internal:true});
 assert.equal((await pool.query("SELECT 1 FROM audit_log WHERE resource=$1 AND action='tasks.updated'",[created.id])).rowCount,1);
});

test('public to internal transitions do not send either previous public or new private titles',async()=>{
 const marker='HIDE-'+suffix,created=await task(marker+' public original',false),before=await noticeCounts(marker);
 assert.ok(before.notifications>0);assert.ok(before.outbox>0);
 const updated=await call('PATCH','/tasks/'+created.id,{internal:true,title:marker+' private replacement'},owner.cookie);
 assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().internal,true);
 assert.deepEqual(await noticeCounts(marker),before);
 assert.equal((await call('GET','/tasks/'+created.id,{},customer.cookie)).statusCode,404);
});

test('internal to public transitions conservatively send no historical or newly visible title',async()=>{
 const marker='REVEAL-'+suffix,created=await task(marker+' confidential original',true);
 const updated=await call('PATCH','/tasks/'+created.id,{internal:false,title:marker+' owner approved public title'},owner.cookie);
 assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().internal,false);
 assert.deepEqual(await noticeCounts(marker),{notifications:0,outbox:0});
 const visible=await call('GET','/tasks/'+created.id,{},customer.cookie);assert.equal(visible.statusCode,200,visible.body);
 assert.equal(visible.json().title,marker+' owner approved public title');
});

test('continuously public task updates notify the customer using the saved final title',async()=>{
 const marker='PUBLIC-'+suffix,created=await task(marker+' original',false),title=marker+' updated final title';
 const updated=await call('PATCH','/tasks/'+created.id,{title,status:'doing'},owner.cookie);
 assert.equal(updated.statusCode,200,updated.body);assert.equal(updated.json().title,title);
 const notifications=(await pool.query("SELECT org_id,title,body FROM notifications WHERE org_id=$1 AND title='tasks.updated' AND body LIKE $2",[customer.user.org_id,'%'+marker+'%'])).rows;
 assert.deepEqual(notifications,[{org_id:customer.user.org_id,title:'tasks.updated',body:title}]);
 const jobs=(await pool.query("SELECT recipient,template,payload FROM outbox WHERE recipient=$1 AND template='tasks.updated' AND payload->>'body' LIKE $2",[customer.email,'%'+marker+'%'])).rows;
 assert.equal(jobs.length,1);assert.equal(jobs[0].payload.body,title);
 assert.equal((await pool.query("SELECT 1 FROM outbox WHERE template='tasks.updated' AND payload->>'body'=$1",[created.title])).rowCount,0);
});

test('customer and cross-organization task reads and writes preserve privacy and emit no jobs',async()=>{
 const marker='DENIED-'+suffix,privateTask=await task(marker+' private',true),publicTask=await task(marker+' public',false);
 const before=await noticeCounts(marker);
 assert.equal((await call('GET','/tasks/'+privateTask.id,{},customer.cookie)).statusCode,404);
 assert.equal((await call('GET','/tasks/'+privateTask.id,{},otherCustomer.cookie)).statusCode,404);
 assert.equal((await call('GET','/tasks/'+publicTask.id,{},otherCustomer.cookie)).statusCode,404);
 const ownList=(await call('GET','/tasks?project_id='+projectId,{},customer.cookie)).json();
 assert.equal(ownList.some((r:{id:string})=>r.id===privateTask.id),false);
 assert.equal(ownList.some((r:{id:string})=>r.id===publicTask.id),true);
 assert.deepEqual((await call('GET','/tasks?project_id='+projectId,{},otherCustomer.cookie)).json(),[]);
 for(const cookie of[customer.cookie,otherCustomer.cookie]){
  assert.equal((await call('PATCH','/tasks/'+privateTask.id,{title:marker+' unauthorized'},cookie)).statusCode,403);
  assert.equal((await call('PATCH','/tasks/'+publicTask.id,{internal:true},cookie)).statusCode,403);
  assert.equal((await call('POST','/tasks',{title:marker+' unauthorized create',project_id:projectId,internal:true},cookie)).statusCode,403);
 }
 assert.equal((await call('PATCH','/tasks/'+privateTask.id,{title:marker+' anonymous'})).statusCode,401);
 assert.deepEqual(await noticeCounts(marker),before);
 assert.equal((await pool.query('SELECT title FROM tasks WHERE id=$1',[privateTask.id])).rows[0].title,privateTask.title);
});
