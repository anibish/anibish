import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ImapFlow} from 'imapflow';
import {pool} from '../db';
import {migrate} from '../migrate';
import {syncMailbox} from '../mail-centre';
const suffix=randomUUID().slice(0,8);let number=0;
const folder=()=>'Cursor-'+suffix+'-'+(++number);
const source=(uid:number)=>Buffer.from('From: qa@example.test\r\nTo: owner@example.test\r\nMessage-ID: <cursor-'+suffix+'-'+uid+'@example.test>\r\nSubject: Synthetic message '+uid+'\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nSynthetic complete body '+uid);
type Meta={uid:number;size?:number;flags?:Set<string>};
function fake(all:number[],metadata:Meta[]|null,bodies:(uid:number)=>unknown){const bodyCalls:number[]=[],metadataRequests:number[][]=[];let released=0;
 const client={mailbox:{uidValidity:7n},getMailboxLock:async()=>({release(){released++}}),search:async()=>all,fetchAll:async(range:string,query:{size?:boolean})=>{const ids=range.split(',').map(Number);if(query.size){metadataRequests.push(ids);return metadata??ids.map(uid=>({uid,size:100,flags:new Set<string>()}))}return ids.map(uid=>({uid,flags:new Set(['\\Seen'])}))},fetchOne:async(uid:number)=>{bodyCalls.push(uid);return bodies(uid)},messageDelete:async()=>{throw Error('Deletion must never be used')},mailboxClose:async()=>{throw Error('Expunge must never be used')}} as unknown as ImapFlow;
 return {run:(async(_account,action)=>action(client)) as Parameters<typeof syncMailbox>[2],bodyCalls,metadataRequests,released:()=>released};
}
const complete=(uid:number)=>({uid,source:source(uid)});
async function state(f:string){return (await pool.query("SELECT cursor_uid,remaining,status,skipped FROM mail_sync_state WHERE mailbox='info' AND folder=$1",[f])).rows[0]}
async function rows(f:string){return(await pool.query("SELECT id,uid,uidvalidity,body_text,body_html,body_evicted,active FROM mail_messages WHERE mailbox='info' AND folder=$1 ORDER BY uidvalidity,uid",[f])).rows}
async function cached(f:string,uid:number,validity='7',evicted=false){return(await pool.query("INSERT INTO mail_messages(mailbox,folder,uidvalidity,uid,subject,body_text,body_html,flags,received_at,body_evicted) VALUES('info',$1,$2,$3,'Existing private history',$4,$5,'[]',now(),$6) RETURNING *",[f,validity,uid,evicted?'':'Keep exact prior body '+uid,evicted?'':'<p>Keep exact prior body</p>',evicted])).rows[0]}
before(async()=>{const u=new URL(process.env.DATABASE_URL||'');if(!['localhost','127.0.0.1'].includes(u.hostname)||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(u.pathname))throw Error('Strict fresh local QA database required.');await migrate()});
after(async()=>{await pool.end()});

test('a false or sourceless lower body remains pending while a higher successful body is preserved and never refetched',async()=>{
 for(const unavailable of[false,{uid:1}]){const f=folder(),first=fake([1,2],null,uid=>uid===1?unavailable:complete(uid));const r=await syncMailbox('info',f,first.run);assert.equal(r.synced,1);assert.equal(r.remaining,1);assert.equal((await state(f)).cursor_uid,'0');assert.equal((await state(f)).status,'history_in_progress');const saved=(await rows(f))[0];assert.equal(Number(saved.uid),2);
  const retry=fake([1,2],null,complete),done=await syncMailbox('info',f,retry.run);assert.deepEqual(retry.metadataRequests,[[1]]);assert.deepEqual(retry.bodyCalls,[1]);assert.equal(done.synced,1);assert.equal(done.remaining,0);assert.equal((await state(f)).cursor_uid,'2');assert.equal((await rows(f)).find(m=>Number(m.uid)===2).id,saved.id);assert.equal(first.released(),1);assert.equal(retry.released(),1);}
});
test('omitted and unordered metadata cannot advance past an unresolved UID',async()=>{
 const f=folder(),first=fake([1,2,3],[{uid:3,size:100},{uid:2,size:100}],complete),r=await syncMailbox('info',f,first.run);assert.equal(r.synced,2);assert.equal(r.remaining,1);assert.equal((await state(f)).cursor_uid,'0');
 const retry=fake([1,2,3],null,complete);assert.equal((await syncMailbox('info',f,retry.run)).remaining,0);assert.deepEqual(retry.bodyCalls,[1]);assert.equal((await state(f)).cursor_uid,'3');
});
test('holes below a legacy high cursor are repaired without rewriting intact bodies, attachments or old generations',async()=>{
 const f=folder(),present=await cached(f,90),old=await cached(f,5,'6');await pool.query("INSERT INTO mail_attachments(message_id,position,name,content,mime) VALUES($1,0,'private.txt',$2,'text/plain')",[present.id,Buffer.from('Exact retained private bytes')]);
 await pool.query("INSERT INTO mail_sync_state(mailbox,folder,status,uidvalidity,cursor_uid,provider_total,remaining,skipped) VALUES('info',$1,'history_synchronized','7',90,3,0,0)",[f]);
 await pool.query("INSERT INTO mail_sync_issues(mailbox,folder,uidvalidity,uid,reason) VALUES('info',$1,'7',10,'UNKNOWN_TRANSIENT_ISSUE')",[f]);
 const first=fake([10,30,90],null,uid=>uid===10?false:complete(uid));const r=await syncMailbox('info',f,first.run);assert.equal(r.remaining,1);assert.equal(r.skipped,0);assert.deepEqual(first.bodyCalls,[10,30]);assert.equal((await state(f)).cursor_uid,'0');
 const retry=fake([10,30,90],null,complete);assert.equal((await syncMailbox('info',f,retry.run)).remaining,0);assert.deepEqual(retry.bodyCalls,[10]);assert.equal((await state(f)).cursor_uid,'90');
 const after=await rows(f);assert.equal(after.find(r=>r.id===present.id).body_text,'Keep exact prior body 90');assert.equal(after.find(r=>r.id===old.id).body_text,'Keep exact prior body 5');assert.equal(after.find(r=>r.id===old.id).active,false);
 assert.equal((await pool.query("SELECT convert_from(content,'UTF8') AS body FROM mail_attachments WHERE message_id=$1",[present.id])).rows[0].body,'Exact retained private bytes');
 assert.equal((await pool.query('SELECT reason FROM mail_sync_issues WHERE folder=$1',[f])).rows[0].reason,'UNKNOWN_TRANSIENT_ISSUE');
});
test('persisted oversized exclusions advance the resolved prefix and are not retried while temporary holes still are',async()=>{
 const f=folder(),huge=Buffer.alloc(12*1024*1024+1,65),first=fake([1,2,3,4],[{uid:1,size:huge.length},{uid:2,size:100},{uid:3,size:100},{uid:4,size:100}],uid=>uid===2?{uid,source:huge}:uid===3?false:complete(uid));
 const r=await syncMailbox('info',f,first.run);assert.equal(r.skipped,2);assert.equal(r.remaining,1);assert.equal((await state(f)).cursor_uid,'2');assert.deepEqual(first.bodyCalls,[2,3,4]);
 const retry=fake([1,2,3,4],null,complete),done=await syncMailbox('info',f,retry.run);assert.deepEqual(retry.bodyCalls,[3]);assert.equal(done.remaining,0);assert.equal(done.skipped,2);assert.equal((await state(f)).cursor_uid,'4');
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM mail_sync_issues WHERE folder=$1 AND reason='MESSAGE_EXCEEDS_12_MB_CACHE_LIMIT'",[f])).rows[0].n,2);
});
test('unexpected, invalid and duplicate metadata responses cannot import bodies or advance the cursor',async()=>{
 const f=folder(),transport=fake([1,2],[{uid:999,size:100},{uid:0,size:100},{uid:NaN,size:100},{uid:2,size:100},{uid:2,size:100}],complete),r=await syncMailbox('info',f,transport.run);
 assert.deepEqual(transport.bodyCalls,[2]);assert.equal(r.synced,1);assert.equal(r.remaining,1);assert.equal((await state(f)).cursor_uid,'0');assert.deepEqual((await rows(f)).map(r=>Number(r.uid)),[2]);
});
test('a legacy evicted body is backfilled only after a successful fetch while intact cached history stays untouched',async()=>{
 const f=folder(),evicted=await cached(f,1,'7',true),intact=await cached(f,2);await pool.query("INSERT INTO mail_sync_state(mailbox,folder,status,uidvalidity,cursor_uid,provider_total,remaining,skipped) VALUES('info',$1,'history_synchronized','7',2,2,0,0)",[f]);
 const first=fake([1,2],null,()=>false),pending=await syncMailbox('info',f,first.run);assert.equal(pending.remaining,1);assert.deepEqual(first.bodyCalls,[1]);assert.equal((await rows(f)).find(r=>r.id===evicted.id).body_evicted,true);
 const retry=fake([1,2],null,complete);assert.equal((await syncMailbox('info',f,retry.run)).remaining,0);assert.deepEqual(retry.bodyCalls,[1]);const after=await rows(f);assert.equal(after.find(r=>r.id===evicted.id).body_evicted,false);assert.match(after.find(r=>r.id===evicted.id).body_text,/Synthetic complete body 1/);assert.equal(after.find(r=>r.id===intact.id).body_text,'Keep exact prior body 2');
});
test('an early hole does not starve later history batches or repeatedly fetch already persisted higher messages',async()=>{
 const f=folder(),all=Array.from({length:105},(_,i)=>i+1),first=fake(all,null,uid=>uid===1?false:complete(uid)),one=await syncMailbox('info',f,first.run);assert.equal(one.synced,99);assert.equal(one.remaining,6);assert.equal((await state(f)).cursor_uid,'0');
 const second=fake(all,null,uid=>uid===1?false:complete(uid)),two=await syncMailbox('info',f,second.run);assert.deepEqual(second.metadataRequests,[[1,101,102,103,104,105]]);assert.equal(two.synced,5);assert.equal(two.remaining,1);
 const third=fake(all,null,complete);assert.equal((await syncMailbox('info',f,third.run)).remaining,0);assert.deepEqual(third.bodyCalls,[1]);assert.equal((await state(f)).cursor_uid,'105');assert.equal((await rows(f)).length,105);
});
test('a later fetch exception preserves earlier committed bodies and retry resumes from durable rows',async()=>{
 const f=folder(),first=fake([1,2],null,uid=>{if(uid===2)throw Error('Synthetic interrupted fetch');return complete(uid)});await assert.rejects(syncMailbox('info',f,first.run),/Synthetic interrupted fetch/);assert.deepEqual((await rows(f)).map(r=>Number(r.uid)),[1]);const original=(await rows(f))[0].id;
 const retry=fake([1,2],null,complete);assert.equal((await syncMailbox('info',f,retry.run)).remaining,0);assert.deepEqual(retry.bodyCalls,[2]);assert.equal((await rows(f)).find(r=>Number(r.uid)===1).id,original);assert.equal(first.released(),1);
});
test('an observed size exclusion replaces an older unknown issue reason and remains an intentional resolved exclusion',async()=>{
 const f=folder();await pool.query("INSERT INTO mail_sync_issues(mailbox,folder,uidvalidity,uid,reason) VALUES('info',$1,'7',7,'UNKNOWN_TRANSIENT_ISSUE')",[f]);
 const observed=fake([7],[{uid:7,size:13*1024*1024}],()=>{throw Error('Oversized body must not be fetched')});const first=await syncMailbox('info',f,observed.run);assert.equal(first.skipped,1);assert.equal(first.remaining,0);assert.equal((await state(f)).cursor_uid,'7');
 assert.equal((await pool.query('SELECT reason FROM mail_sync_issues WHERE folder=$1',[f])).rows[0].reason,'MESSAGE_EXCEEDS_12_MB_CACHE_LIMIT');
 const retry=fake([7],null,()=>{throw Error('Recorded intentional exclusion must not be refetched')});assert.equal((await syncMailbox('info',f,retry.run)).skipped,1);assert.deepEqual(retry.bodyCalls,[]);
});
test('missing or mismatched fetched-body UID never mixes message bytes or falsely completes a lower UID',async()=>{
 for(const wrong of[{uid:999,source:source(999)},{source:source(999)}]){const f=folder(),first=fake([1,2],null,uid=>uid===1?wrong:complete(uid));const r=await syncMailbox('info',f,first.run);assert.equal(r.remaining,1);assert.equal(r.synced,1);assert.deepEqual((await rows(f)).map(row=>Number(row.uid)),[2]);assert.equal((await state(f)).cursor_uid,'0');
 const retry=fake([1,2],null,complete);assert.equal((await syncMailbox('info',f,retry.run)).remaining,0);assert.match((await rows(f)).find(row=>Number(row.uid)===1).body_text,/Synthetic complete body 1/);}
});
