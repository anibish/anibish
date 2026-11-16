import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ImapFlow} from 'imapflow';
import {pool} from '../db';
import {migrate} from '../migrate';
import {buildServer} from '../server';
import {totp} from '../security';
import type {Actor} from '../context';
import {enqueueProviderDraft,getProviderDraftState,processProviderDraftJobs,requestProviderDraftReconcile,type ProviderDraftTransport} from '../provider-drafts';

const suffix=randomUUID().slice(0,8),password='Private-draft-QA-'+randomUUID();
const headers={origin:'http://localhost:3000','x-studio-client':'web','content-type':'application/json'};
const ip='127.44.'+parseInt(suffix.slice(0,2),16)+'.'+parseInt(suffix.slice(2,4),16);
let app:Awaited<ReturnType<typeof buildServer>>,owner:Actor,ownerCookie='',customerCookie='',unenrolledCookie='';
const savedEnvironment:Record<string,string|undefined>={};
async function call(method:'GET'|'POST'|'PUT',url:string,body:unknown={},cookie=ownerCookie){return app.inject({method,url,remoteAddress:ip,headers:{...headers,...(cookie?{cookie}:{})},...(method==='GET'?{}:{payload:JSON.stringify(body)})});}
async function register(name:string){
 const email=`draft-${name}-${suffix}@example.test`,created=await call('POST','/auth/register',{name,email,password},'');assert.equal(created.statusCode,201,created.body);
 const token=new URL('http://localhost'+created.json().development_link).searchParams.get('token');assert.equal((await call('POST','/auth/token',{token},'')).statusCode,200);
 const login=await call('POST','/auth/login',{email,password},'');assert.equal(login.statusCode,200,login.body);const cookie=String(login.headers['set-cookie']);
 return {cookie,user:(await call('GET','/auth/me',{},cookie)).json().user};
}
before(async()=>{
 if(!process.env.DATABASE_URL?.includes('anibish_qa'))throw Error('Provider-draft tests require isolated anibish_qa storage.');
 await migrate();app=await buildServer();const admin=await register('owner'),customer=await register('customer'),unenrolled=await register('unenrolled');
 for(const u of[admin,unenrolled])await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[u.user.id]);
 ownerCookie=admin.cookie;customerCookie=customer.cookie;unenrolledCookie=unenrolled.cookie;
 const setup=(await call('POST','/auth/mfa/setup')).json();assert.equal((await call('POST','/auth/mfa/verify',{code:totp(setup.secret)})).statusCode,200);
 owner={...admin.user,global_role:'super_admin',mfa_enabled:true,mfa_verified:true};
 for(const key of['ANIBISH_MAIL_ENABLED','ANIBISH_INFO_IMAP_PASSWORD','ANIBISH_MAIL_IMAP_PASSWORD'])savedEnvironment[key]=process.env[key];
 process.env.ANIBISH_MAIL_ENABLED='true';process.env.ANIBISH_INFO_IMAP_PASSWORD='QA-ONLY-NOT-A-PROVIDER-CREDENTIAL';process.env.ANIBISH_MAIL_IMAP_PASSWORD='QA-ONLY-NOT-A-PROVIDER-CREDENTIAL';
});
after(async()=>{for(const[k,v]of Object.entries(savedEnvironment)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await app?.close();await pool.end();});

type Message={raw:Buffer;flags:Set<string>};
type Folder={validity:bigint;next:number;messages:Map<number,Message>};
class ProviderMock{
 accounts=new Map<string,Map<string,Folder>>();appendCalls=0;moveCalls=0;ackLoss=false;moveAckLoss=false;omitAppendUid=false;searchFailure:false|undefined|null=null;nativeMove=true;moveHook:(()=>Promise<void>)|null=null;
 folders(account='mail'){let result=this.accounts.get(account);if(!result){result=new Map([['Drafts',{validity:1n,next:1,messages:new Map()}],['Trash',{validity:2n,next:1,messages:new Map()}]]);this.accounts.set(account,result);}return result;}
 transport:ProviderDraftTransport=async(account,action)=>{
  const folders=this.folders(account);let selected='';
  const client={
   capabilities:new Set(this.nativeMove?['MOVE','UIDPLUS']:['UIDPLUS']),
   get mailbox(){return selected?{uidValidity:folders.get(selected)!.validity}:false;},
   list:async()=>[...folders.keys()].map(path=>({path,name:path,flags:new Set(),specialUse:path==='Drafts'?'\\Drafts':'\\Trash',specialUseSource:'extension'})),
   getMailboxLock:async(path:string)=>{assert.ok(folders.has(path));selected=path;return {release(){}};},
   search:async(query:{header:Record<string,string>})=>{
    if(this.searchFailure!==null){const result=this.searchFailure;this.searchFailure=null;return result;}
    const needle=query.header['message-id'];return [...folders.get(selected)!.messages].filter(([,m])=>(m.raw.toString().match(/^Message-ID:\s*(.+)$/im)?.[1]?.trim()||'').includes(needle)).map(([uid])=>uid);
   },
   fetchOne:async(uid:number)=>{const m=folders.get(selected)!.messages.get(uid);return m?{uid,source:m.raw,envelope:{messageId:m.raw.toString().match(/^Message-ID:\s*(.+)$/im)?.[1].trim()},flags:m.flags}:false;},
   append:async(path:string,raw:Buffer,flags:string[])=>{this.appendCalls++;const f=folders.get(path)!,uid=f.next++;f.messages.set(uid,{raw:Buffer.from(raw),flags:new Set(flags)});await new Promise(r=>setTimeout(r,10));if(this.ackLoss){this.ackLoss=false;throw Object.assign(Error('Synthetic acknowledgment loss'),{code:'ECONNECTION'});}return this.omitAppendUid?false:{uid,uidValidity:f.validity};},
   messageMove:async(uid:number,target:string)=>{this.moveCalls++;if(this.moveHook)await this.moveHook();const source=folders.get(selected)!,m=source.messages.get(uid);assert.ok(m);source.messages.delete(uid);const dest=folders.get(target)!,newUid=dest.next++;dest.messages.set(newUid,m);if(this.moveAckLoss){this.moveAckLoss=false;throw Object.assign(Error('Synthetic MOVE acknowledgment loss'),{code:'ECONNECTION'});}return {uidValidity:dest.validity,uidMap:new Map([[uid,newUid]])};},
   messageDelete:async()=>{throw Error('EXPUNGE/deletion is forbidden');},mailboxClose:async()=>{throw Error('CLOSE/EXPUNGE is forbidden');},
  };
  return action(client as unknown as ImapFlow);
 };
}
async function draft(){const r=await call('POST','/email/drafts',{mailbox:'mail',recipient:'',subject:'[SYNTHETIC] Provider draft '+randomUUID(),body:'Private unsent QA body',extras:{cc:[],attachments:[]},idempotency_key:randomUUID()});assert.equal(r.statusCode,200,r.body);return r.json();}
async function update(d:{id:string;mailbox:string;recipient:string;subject:string;body:string;updated_at:string},body:string){const r=await call('PUT','/email/drafts/'+d.id,{mailbox:d.mailbox,recipient:d.recipient,subject:d.subject,body,extras:{cc:[],attachments:[]},expected_updated_at:d.updated_at});assert.equal(r.statusCode,200,r.body);return r.json();}
async function job(id:string){return(await pool.query('SELECT * FROM mail_draft_sync_jobs WHERE id=$1',[id])).rows[0];}
async function queued(d:{id:string;revision:number}){const state=await enqueueProviderDraft(d.id,d.revision,owner);assert.ok(state.job);return state.job!;}

test('saved provider sync is MFA-only, explicit, revision guarded and does not change private draft content',async()=>{
 const d=await draft(),before=(await pool.query('SELECT * FROM mail_drafts WHERE id=$1',[d.id])).rows[0];
 for(const cookie of['',customerCookie,unenrolledCookie]){
  const expected=cookie?403:401;assert.equal((await call('GET','/email/drafts/'+d.id+'/provider-sync',{},cookie)).statusCode,expected);
  assert.equal((await call('POST','/email/drafts/'+d.id+'/provider-sync',{expected_revision:d.revision,confirmed:true},cookie)).statusCode,expected);
 }
 assert.equal((await call('POST','/email/drafts/'+d.id+'/provider-sync',{expected_revision:999,confirmed:true})).statusCode,409);
 assert.equal((await call('POST','/email/drafts/'+d.id+'/provider-sync',{expected_revision:d.revision})).statusCode,400);
 const saved=await call('POST','/email/drafts/'+d.id+'/provider-sync',{expected_revision:d.revision,confirmed:true});assert.equal(saved.statusCode,200,saved.body);
 assert.equal((await pool.query('SELECT count(*)::int AS count FROM mail_draft_sync_jobs WHERE draft_id=$1',[d.id])).rows[0].count,1);
 assert.deepEqual((await pool.query('SELECT * FROM mail_drafts WHERE id=$1',[d.id])).rows[0],before);
});

test('concurrent/repeated queue and worker runs produce one verified APPEND with durable provider identity',async()=>{
 const d=await draft(),mock=new ProviderMock(),states=await Promise.all([enqueueProviderDraft(d.id,1,owner),enqueueProviderDraft(d.id,1,owner)]);assert.equal(states[0].job!.id,states[1].job!.id);const id=states[0].job!.id;
 await Promise.all([processProviderDraftJobs(mock.transport,id),processProviderDraftJobs(mock.transport,id)]);await processProviderDraftJobs(mock.transport,id);
 const r=await job(id);assert.equal(mock.appendCalls,1);assert.equal(r.status,'confirmed');assert.equal(r.provider_folder,'Drafts');assert.equal(r.provider_uidvalidity,'1');assert.equal(Number(r.provider_uid),1);assert.ok(r.append_attempted_at);
 await assert.rejects(pool.query("UPDATE mail_draft_sync_jobs SET raw_message='tampered' WHERE id=$1",[id]),/immutable/);
});

test('lost APPEND acknowledgement reconciles persisted bytes without ever appending again',async()=>{
 const d=await draft(),j=await queued(d),mock=new ProviderMock();mock.ackLoss=true;await processProviderDraftJobs(mock.transport,j.id);assert.equal((await job(j.id)).status,'uncertain');assert.equal(mock.appendCalls,1);
 const edited=await update(d,'Newer local content');await assert.rejects(enqueueProviderDraft(d.id,edited.revision,owner),/earlier provider result/i);
 await requestProviderDraftReconcile(d.id,j.id,owner);await processProviderDraftJobs(mock.transport,j.id);assert.equal((await job(j.id)).status,'confirmed');assert.equal(mock.appendCalls,1);assert.equal((await pool.query('SELECT body FROM mail_drafts WHERE id=$1',[d.id])).rows[0].body,'Newer local content');
});

test('non-authoritative search results never permit APPEND',async()=>{
 for(const failure of[false,undefined] as const){const d=await draft(),j=await queued(d),mock=new ProviderMock();mock.searchFailure=failure;await processProviderDraftJobs(mock.transport,j.id);const r=await job(j.id);assert.equal(mock.appendCalls,0);assert.equal(r.status,'uncertain');assert.equal(r.last_error,'PROVIDER_SEARCH_UNCERTAIN');assert.equal(r.append_attempted_at,null);}
});

test('restart recovers an expired processing lease by reconciling a provider copy',async()=>{
 const d=await draft(),j=await queued(d),mock=new ProviderMock();mock.ackLoss=true;await processProviderDraftJobs(mock.transport,j.id);
 await pool.query("UPDATE mail_draft_sync_jobs SET status='processing',locked_at=now()-interval '24 hours',available_at=now() WHERE id=$1",[j.id]);
 await processProviderDraftJobs(mock.transport,j.id);assert.equal((await job(j.id)).status,'confirmed');assert.equal(mock.appendCalls,1);
});

test('APPEND without UIDPLUS acknowledgement is verified using exact Message-ID and bytes',async()=>{
 const d=await draft(),j=await queued(d),mock=new ProviderMock();mock.omitAppendUid=true;await processProviderDraftJobs(mock.transport,j.id);assert.equal((await job(j.id)).status,'confirmed');assert.equal(mock.appendCalls,1);
});

test('replacement moves the exact old copy only after durable new-copy confirmation and verifies Trash',async()=>{
 const d=await draft(),one=await queued(d),mock=new ProviderMock();await processProviderDraftJobs(mock.transport,one.id);
 const changed=await update(d,'Saved revision two'),two=await queued(changed);mock.moveHook=async()=>{assert.equal((await job(two.id)).status,'confirmed');};
 await processProviderDraftJobs(mock.transport,two.id);assert.equal(mock.appendCalls,2);assert.equal(mock.moveCalls,1);assert.equal(mock.folders().get('Drafts')!.messages.size,1);assert.equal(mock.folders().get('Trash')!.messages.size,1);const previous=await job(one.id);assert.equal(previous.cleanup_status,'moved_to_trash');assert.equal(previous.cleanup_folder,'Trash');assert.equal(previous.cleanup_uidvalidity,'2');assert.ok(previous.cleanup_uid);
});

test('missing native MOVE retains the older copy without an EXPUNGE fallback',async()=>{
 const d=await draft(),one=await queued(d),mock=new ProviderMock();await processProviderDraftJobs(mock.transport,one.id);mock.nativeMove=false;const two=await queued(await update(d,'Another revision'));await processProviderDraftJobs(mock.transport,two.id);
 assert.equal(mock.moveCalls,0);assert.equal(mock.folders().get('Drafts')!.messages.size,2);assert.equal((await job(two.id)).status,'confirmed');assert.equal((await job(one.id)).cleanup_status,'retained');
});

test('UIDVALIDITY change never moves an unrelated reused UID',async()=>{
 const d=await draft(),one=await queued(d),mock=new ProviderMock();await processProviderDraftJobs(mock.transport,one.id);const f=mock.folders().get('Drafts')!;f.validity=9n;f.messages.clear();const unrelated=Buffer.from('Message-ID: <unrelated@example.test>\r\n\r\nKeep this original');f.messages.set(1,{raw:unrelated,flags:new Set()});f.next=2;
 const two=await queued(await update(d,'Safe replacement with changed provider validity'));await processProviderDraftJobs(mock.transport,two.id);assert.equal(mock.moveCalls,0);assert.equal((await job(one.id)).last_error,'OLD_UIDVALIDITY_CHANGED');assert.ok(f.messages.get(1)!.raw.equals(unrelated));assert.equal((await job(two.id)).status,'confirmed');
});

test('an externally modified older draft is preserved instead of replaced or deleted',async()=>{
 const d=await draft(),one=await queued(d),mock=new ProviderMock();await processProviderDraftJobs(mock.transport,one.id);const f=mock.folders().get('Drafts')!,old=f.messages.get(1)!;old.raw=Buffer.concat([old.raw,Buffer.from('\r\nExternal owner edit')]);const two=await queued(await update(d,'Newer local revision'));await processProviderDraftJobs(mock.transport,two.id);assert.equal(mock.moveCalls,0);assert.equal((await job(one.id)).cleanup_status,'retained');assert.equal((await job(one.id)).last_error,'PROVIDER_COPY_CHANGED');assert.equal(f.messages.size,2);
});

test('no provider copy after an uncertain attempt remains uncertain without a blind retry',async()=>{
 const d=await draft(),j=await queued(d),mock=new ProviderMock();mock.ackLoss=true;await processProviderDraftJobs(mock.transport,j.id);mock.folders().get('Drafts')!.messages.clear();await requestProviderDraftReconcile(d.id,j.id,owner);await processProviderDraftJobs(mock.transport,j.id);assert.equal((await job(j.id)).status,'uncertain');assert.equal(mock.appendCalls,1);
 const state=await getProviderDraftState(d.id);assert.match(state.job!.message,/uncertain/i);
});

test('lost MOVE acknowledgement reconciles both folders without a second MOVE',async()=>{
 const d=await draft(),one=await queued(d),mock=new ProviderMock();await processProviderDraftJobs(mock.transport,one.id);
 const two=await queued(await update(d,'Second revision with lost MOVE acknowledgement'));mock.moveAckLoss=true;await processProviderDraftJobs(mock.transport,two.id);
 assert.equal((await job(two.id)).status,'confirmed');assert.equal((await job(two.id)).cleanup_status,'uncertain');assert.equal((await job(one.id)).cleanup_status,'uncertain');
 await requestProviderDraftReconcile(d.id,two.id,owner);await processProviderDraftJobs(mock.transport,two.id);
 assert.equal(mock.moveCalls,1);assert.equal(mock.appendCalls,2);assert.equal((await job(one.id)).cleanup_status,'moved_to_trash');assert.equal((await job(two.id)).cleanup_status,'complete');
});

test('matching Message-ID with changed content is uncertain and never overwritten',async()=>{
 const d=await draft(),j=await queued(d),mock=new ProviderMock(),stored=await job(j.id),f=mock.folders().get('Drafts')!;
 const changed=Buffer.concat([stored.raw_message,Buffer.from('\r\nAn external change')]);f.messages.set(1,{raw:changed,flags:new Set(['\\Draft'])});f.next=2;
 await processProviderDraftJobs(mock.transport,j.id);assert.equal(mock.appendCalls,0);assert.equal((await job(j.id)).status,'uncertain');assert.equal((await job(j.id)).last_error,'PROVIDER_COPY_CHANGED');assert.ok(f.messages.get(1)!.raw.equals(changed));
});

test('a newer saved revision supersedes an unstarted job without copying stale content',async()=>{
 const d=await draft(),j=await queued(d),mock=new ProviderMock();await update(d,'New content saved before provider worker starts');await processProviderDraftJobs(mock.transport,j.id);assert.equal(mock.appendCalls,0);assert.equal((await job(j.id)).status,'superseded');
});
