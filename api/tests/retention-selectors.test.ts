import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool} from '../db';
import {migrate} from '../migrate';
import {buildServer} from '../server';
import {retentionRule,selectRetentionCandidates} from '../retention-selectors';
import {retentionOption,retentionOptions} from '../../src/lib/retention-options';
import {accountTokenFromLink} from './account-link-fixture';
import {fixtureInject,freshTotp} from './auth-factor-fixture';

const suffix=randomUUID().slice(0,8),password='Local-retention-'+randomUUID(),headers={origin:'http://localhost:3000','x-studio-client':'web','content-type':'application/json'};let serial=0;
let app:Awaited<ReturnType<typeof buildServer>>;
const rule=(category='leads',extra:Record<string,unknown>={})=>({category,trigger:retentionOption(category)!.trigger,period_days:10,period_confirmed:true,legal_hold:false,purpose:'Synthetic isolated purpose; no legal retention conclusion.',legal_basis:'Synthetic contractual QA basis; not legal advice or approval.',approval_reference:'Explicit isolated QA test fixture only.',method:'Manual review only; no deletion.',exceptions:'Preserve holds, contracts, financial and audit evidence.',responsible_party:'Isolated QA owner',...extra});
async function call(method:'GET'|'POST',url:string,body:unknown={},cookie=''){return fixtureInject(app,{method,url,remoteAddress:'127.79.'+Math.floor(++serial/250)+'.'+serial%250,headers:{...headers,...cookie?{cookie}:{}},...method==='GET'?{}:{payload:JSON.stringify(body)}});}
async function account(label:string,owner=false,enroll=false){const email=`retention-${label}-${suffix}@example.test`,created=await call('POST','/auth/register',{name:label,email,password});assert.equal(created.statusCode,201,created.body);assert.equal((await call('POST','/auth/token',{token:accountTokenFromLink(created.json().development_link)})).statusCode,200);const signed=await call('POST','/auth/login',{email,password});assert.equal(signed.statusCode,200,signed.body);const cookie=String(signed.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;if(owner)await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[user.id]);if(enroll){const setup=(await call('POST','/auth/mfa/setup',{password},cookie)).json();assert.equal((await call('POST','/auth/mfa/verify',{password,code:freshTotp(setup.secret)},cookie)).statusCode,200);}return {cookie,user};}
let owner:Awaited<ReturnType<typeof account>>,customer:typeof owner,unenrolled:typeof owner;
before(async()=>{const url=new URL(process.env.DATABASE_URL||'');if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(url.pathname))throw Error('Dedicated local QA database required.');await migrate();app=await buildServer();owner=await account('owner',true,true);customer=await account('customer');unenrolled=await account('unenrolled',true,false);});
after(async()=>{await app?.close();await pool.end();});

test('sixteen fixed selector families reject caller SQL, wrong timestamps and unconfirmed or incomplete policy data',()=>{
 assert.equal(retentionOptions.length,16);
 for(const category of retentionOptions){assert.equal(retentionRule.safeParse(rule(category.value)).success,true);assert.equal(retentionRule.safeParse(rule(category.value,{trigger:'created_at; DROP TABLE users'})).success,false);}
 assert.equal(retentionRule.safeParse(rule('enquiries')).success,true);
 for(const missing of['purpose','legal_basis','approval_reference','method','exceptions','responsible_party','period_confirmed']){const data=rule();delete data[missing as keyof typeof data];assert.equal(retentionRule.safeParse(data).success,false,missing);}
 for(const data of[rule('leads',{category:'leads; DROP TABLE users'}),rule('leads',{period_confirmed:false}),rule('leads',{period_days:0}),rule('leads',{period_days:36501}),rule('leads',{trigger:'expires_at'})])assert.equal(retentionRule.safeParse(data).success,false);
});

test('legal hold defaults to true and prevents all database selection; backup coverage stays explicitly unknown',async()=>{
 let queries=0;const db={query:async()=>{queries++;throw Error('No selection expected');}} as unknown as PoolClient;
 const input=rule();delete (input as {legal_hold?:boolean}).legal_hold;
 const held=await selectRetentionCandidates(db,input);assert.equal(held.candidate_count,0);assert.equal(held.detail.selection_status,'blocked_by_legal_hold');assert.equal(queries,0);
 const external=await selectRetentionCandidates(db,rule('backups'));assert.equal(external.candidate_count,null);assert.equal(external.detail.selection_status,'unsupported_external');assert.equal(external.detail.count_complete,false);assert.equal(queries,0);
 await assert.rejects(selectRetentionCandidates(db,rule('leads',{category:'users WHERE true --'})),/No records were selected/);assert.equal(queries,0);
});

test('actual database ages cover every selector without changing data; deactivated customers, dates and unknown mail ages remain distinct',async()=>{
 const db=await pool.connect();try{
  await db.query('BEGIN');const before=new Map();for(const option of retentionOptions)before.set(option.value,await selectRetentionCandidates(db,rule(option.value)));
  const org=customer.user.org_id,user=customer.user.id,project=randomUUID(),conversation=randomUUID(),order=randomUUID(),invoice=randomUUID(),mail=randomUUID(),review='retention-'+randomUUID(),file=randomUUID();
  await db.query("INSERT INTO users(email,name,password_hash,created_at,disabled_at,global_role) VALUES($1,'Inactive QA','synthetic',now()-interval '30 days',now()-interval '20 days',NULL),($2,'Active QA','synthetic',now()-interval '30 days',NULL,NULL),($3,'Staff QA','synthetic',now()-interval '30 days',now()-interval '20 days','admin')",['inactive-'+suffix+'@example.test','active-'+suffix+'@example.test','staff-'+suffix+'@example.test']);
  await db.query("INSERT INTO leads(title,email,brief,created_at) VALUES('Old QA','old@example.test','Synthetic retained lead',now()-interval '20 days'),('New QA','new@example.test','Synthetic retained lead',now())");
  await db.query("INSERT INTO projects(id,org_id,title) VALUES($1,$2,'Retention fixture')",[project,org]);await db.query("INSERT INTO conversations(id,org_id,project_id,title) VALUES($1,$2,$3,'Retention fixture')",[conversation,org,project]);
  await db.query("INSERT INTO messages(org_id,conversation_id,user_id,body,created_at) VALUES($1,$2,$3,'Synthetic old message',now()-interval '20 days')",[org,conversation,user]);
  await db.query("INSERT INTO files(id,org_id,user_id,name,mime,size,storage_key,sha256,created_at) VALUES($1,$2,$3,'synthetic.txt','text/plain',1,$4,'synthetic',now()-interval '20 days')",[file,org,user,file+'.bin']);
  await db.query("INSERT INTO mail_messages(id,mailbox,folder,uidvalidity,uid,received_at) VALUES($1,'mail',$2,'1',1,now()-interval '20 days'),($3,'mail',$2,'1',2,NULL),($4,'mail',$2,'1',3,now())",[mail,'Retention-'+suffix,randomUUID(),randomUUID()]);
  await db.query("INSERT INTO mail_attachments(message_id,position,name,content,mime) SELECT id,0,'synthetic.txt','x','text/plain' FROM mail_messages WHERE folder=$1",['Retention-'+suffix]);
  await db.query("INSERT INTO deliveries(org_id,project_id,title,note,created_at) VALUES($1,$2,'Synthetic old delivery','Read-only test fixture',now()-interval '20 days')",[org,project]);
  await db.query("INSERT INTO audit_log(action,resource,created_at) VALUES('synthetic.retention','fixture',now()-interval '20 days')");await db.query("INSERT INTO security_events(event,created_at) VALUES('synthetic_retention',now()-interval '20 days')");
  await db.query("INSERT INTO orders(id,org_id,title,currency,total,created_at) VALUES($1,$2,'Synthetic financial fixture','INR',0,now()-interval '20 days')",[order,org]);await db.query("INSERT INTO invoices(id,org_id,order_id,number,currency,total,created_at) VALUES($1,$2,$3,$4,'INR',0,now()-interval '20 days')",[invoice,org,order,'QA-'+suffix]);
  await db.query("INSERT INTO tickets(org_id,title,body,created_at) VALUES($1,'Synthetic old ticket','Read-only fixture',now()-interval '20 days')",[org]);await db.query("INSERT INTO marketing_consents(user_id,opted_in,workflow,recorded_at) VALUES($1,false,'synthetic_retention',now()-interval '20 days')",[user]);
  await db.query("INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()-interval '20 days'),($3,$2,now()+interval '1 day')",['expired-'+randomUUID(),user,'future-'+randomUUID()]);
  await db.query("INSERT INTO auth_tokens(id,user_id,kind,expires_at) VALUES($1,$2,'verify',now()-interval '20 days'),($3,$2,'verify',now()+interval '1 day')",['expired-'+randomUUID(),user,'future-'+randomUUID()]);
  await db.query("INSERT INTO review_candidates(id,source_number,original_text,transcription,updated_at) VALUES($1,9997,'Synthetic private review','Synthetic private review',now()-interval '20 days')",[review]);
  const totals=(await db.query('SELECT (SELECT count(*) FROM files)::int AS files,(SELECT count(*) FROM messages)::int AS messages,(SELECT count(*) FROM invoices)::int AS invoices,(SELECT count(*) FROM mail_attachments)::int AS attachments')).rows[0];
  for(const option of retentionOptions){
   const result=await selectRetentionCandidates(db,rule(option.value)),prior=before.get(option.value);
   if(option.value==='backups'){assert.equal(result.candidate_count,null);continue;}
   assert.equal(Number(result.candidate_count)-Number(prior.candidate_count),option.value==='financial_documents'?2:1,option.value);
   assert.equal(result.detail.record_deletion_performed,false);assert.equal(result.detail.deletion_eligibility_assessed,false);
   if(['mail_cache','email_attachments'].includes(option.value)){assert.equal(Number(result.detail.unknown_age_count)-Number(prior.detail.unknown_age_count),1);assert.equal(result.detail.count_complete,false);}
  }
  assert.equal((await selectRetentionCandidates(db,rule('enquiries'))).candidate_count,(await selectRetentionCandidates(db,rule('leads'))).candidate_count);
  assert.deepEqual((await db.query('SELECT (SELECT count(*) FROM files)::int AS files,(SELECT count(*) FROM messages)::int AS messages,(SELECT count(*) FROM invoices)::int AS invoices,(SELECT count(*) FROM mail_attachments)::int AS attachments')).rows[0],totals);
  assert.equal((await db.query('SELECT 1 FROM files WHERE id=$1',[file])).rowCount,1);
 }finally{await db.query('ROLLBACK');db.release();}
});

async function savedRule(data:unknown,status='approved'){
 const response=await call('POST','/compliance/records',{client_reference:randomUUID(),kind:'retention',title:'Synthetic retained-rule fixture '+suffix,status,data,assessment_note:'Isolated technical QA fixture; no legal applicability asserted.',owner_review_approved:status==='approved'},owner.cookie);assert.equal(response.statusCode,200,response.body);return response.json();
}
test('only MFA Super Admin can run scoped aggregates; unapproved, incomplete and SQL-like rules cannot run',async()=>{
 const policy=await savedRule(rule());for(const [cookie,status]of[['',401],[customer.cookie,403],[unenrolled.cookie,403]] as const)assert.equal((await call('POST','/compliance/retention/dry-run',{policy_id:policy.id},cookie)).statusCode,status);
 const unapproved=await savedRule(rule(),'draft');assert.equal((await call('POST','/compliance/retention/dry-run',{policy_id:unapproved.id},owner.cookie)).statusCode,409);
 const incomplete=await savedRule({category:'leads',period_days:1,purpose:'Incomplete synthetic policy'});assert.equal((await call('POST','/compliance/retention/dry-run',{policy_id:incomplete.id},owner.cookie)).statusCode,409);
 const hostile=await savedRule(rule('leads',{category:'leads; DROP TABLE files --'}));assert.equal((await call('POST','/compliance/retention/dry-run',{policy_id:hostile.id},owner.cookie)).statusCode,409);
 const before=(await pool.query('SELECT count(*)::int AS n FROM leads')).rows[0].n,result=await call('POST','/compliance/retention/dry-run',{policy_id:policy.id},owner.cookie);assert.equal(result.statusCode,200,result.body);assert.equal(result.headers['cache-control'],'private, no-store');assert.equal(result.json().detail.policy_revision,1);assert.equal(result.json().detail.record_deletion_performed,false);assert.equal((await pool.query('SELECT count(*)::int AS n FROM leads')).rows[0].n,before);
 assert.equal((await call('POST','/compliance/retention/execute',{policy_id:policy.id},owner.cookie)).statusCode,404);
});
test('unsupported external backup coverage persists as unknown in API history and every run keeps immutable audit evidence',async()=>{
 const policy=await savedRule(rule('backups')),response=await call('POST','/compliance/retention/dry-run',{policy_id:policy.id},owner.cookie);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().candidate_count,null);assert.equal(response.json().detail.selection_status,'unsupported_external');assert.match(response.json().message,/No complete candidate count/);
 const held=await savedRule(rule('files',{legal_hold:true})),blocked=await call('POST','/compliance/retention/dry-run',{policy_id:held.id},owner.cookie);assert.equal(blocked.statusCode,200,blocked.body);assert.equal(blocked.json().candidate_count,0);assert.equal(blocked.json().detail.selection_status,'blocked_by_legal_hold');
 const runs=(await call('GET','/compliance/retention/runs',{},owner.cookie)).json();assert.equal(runs.find((r:{id:string})=>r.id===response.json().id).candidate_count,null);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM compliance_events WHERE record_id=$1 AND event='retention.dry_run'",[policy.id])).rows[0].n,1);
 assert.equal((await call('GET','/compliance/history/verify',{},owner.cookie)).json().valid,true);
});
