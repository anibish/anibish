import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,createHmac,createDecipheriv} from 'node:crypto';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {totp} from '../security';
import {runComplianceReminders} from '../compliance';
let app:Awaited<ReturnType<typeof buildServer>>;
const suffix=randomUUID().slice(0,8),password='Governance-isolated-QA-'+randomUUID(),headers={origin:'http://localhost:3000','x-studio-client':'web','content-type':'application/json'};
let address=0;
async function request(method:'GET'|'POST'|'PATCH'|'DELETE',path:string,body:unknown={},cookie=''){return app.inject({method,url:path,headers:{...headers,...(cookie?{cookie}:{})},remoteAddress:'127.61.'+Math.floor(++address/250)+'.'+address%250,...(method==='GET'?{}:{payload:JSON.stringify(body)})});}
async function account(label:string,role?:string,enroll=false){const email='governance-'+label+'-'+suffix+'@example.test';const created=await request('POST','/auth/register',{name:label,email,password,organization:'Governance QA '+label});assert.equal(created.statusCode,201,created.body);const token=new URL('http://localhost'+created.json().development_link).searchParams.get('token');assert.equal((await request('POST','/auth/token',{token})).statusCode,200);const signed=await request('POST','/auth/login',{email,password});assert.equal(signed.statusCode,200,signed.body);const cookie=String(signed.headers['set-cookie']),user=(await request('GET','/auth/me',{},cookie)).json().user;if(role)await pool.query('UPDATE users SET global_role=$1 WHERE id=$2',[role,user.id]);if(enroll){const setup=(await request('POST','/auth/mfa/setup',{},cookie)).json();assert.equal((await request('POST','/auth/mfa/verify',{code:totp(setup.secret)},cookie)).statusCode,200);}return{cookie,user};}
let owner:Awaited<ReturnType<typeof account>>,customer:typeof owner,other:typeof owner,staff:typeof owner,unenrolled:typeof owner;
let eventRecord='',importedId='',privacyId='';
const record=(extra:Record<string,unknown>={})=>({client_reference:randomUUID(),kind:'risk',title:'Synthetic private governance assessment '+suffix,status:'open',data:{scope:'Isolated synthetic evidence'},assessment_note:'An explicit synthetic assessment note.',...extra});
const incident=(extra:Record<string,unknown>={})=>({client_reference:randomUUID(),title:'Synthetic private incident '+suffix,severity:'medium',status:'assessing',discovered_at:'2026-01-01T01:00:00+05:30',aware_at:null,certin_decision:'undetermined',gdpr_decision:'undetermined',uk_decision:'undetermined',role:'undetermined',data:{synthetic:true},assessment_note:'Synthetic assessed incident facts only.',...extra});
before(async()=>{
 if(!process.env.DATABASE_URL||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(new URL(process.env.DATABASE_URL).pathname))throw Error('Compliance tests require a dedicated local ANIBISH QA database.');
 process.env.ANIBISH_SECURITY_LOGGING='true';process.env.MFA_ENCRYPTION_KEY=randomBytes(32).toString('hex');await migrate();app=await buildServer();
 owner=await account('owner','super_admin',true);customer=await account('customer');other=await account('other');staff=await account('staff','project_manager',true);unenrolled=await account('unenrolled','super_admin',false);
});
after(async()=>{await app?.close();await pool.end()});

test('private compliance routes require real Super Admin MFA and prevent customer or lesser-role access',async()=>{
 for(const path of['/compliance/overview','/compliance/records','/compliance/incidents','/compliance/history','/compliance/history/verify','/compliance/privacy-requests','/compliance/retention/runs','/compliance/security-events','/compliance/export']){
  for(const [cookie,status]of[['',401],[customer.cookie,403],[staff.cookie,403],[unenrolled.cookie,403]]as const)assert.equal((await request('GET',path,{},cookie)).statusCode,status,path);
  const ok=await request('GET',path,{},owner.cookie);assert.equal(ok.statusCode,200,ok.body);assert.equal(ok.headers['cache-control'],'private, no-store');
 }
 assert.equal((await request('POST','/compliance/records',record(),customer.cookie)).statusCode,403);
 assert.equal((await request('POST','/compliance/import',{records:[]},staff.cookie)).statusCode,403);
});

test('record create uses one exact client UUID, concurrency is idempotent and changed retries cannot overwrite',async()=>{
 const body=record(),replies=await Promise.all([request('POST','/compliance/records',body,owner.cookie),request('POST','/compliance/records',body,owner.cookie)]);for(const r of replies){assert.equal(r.statusCode,200,r.body);assert.equal(r.json().id,body.client_reference);}eventRecord=body.client_reference;
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM compliance_events WHERE record_id=$1 AND event='record.created'",[eventRecord])).rows[0].n,1);
 assert.equal((await request('POST','/compliance/records',{...body,title:'A different title must not replace saved evidence'},owner.cookie)).statusCode,409);assert.equal((await request('POST','/compliance/records',{...body,assessment_note:'A changed rationale cannot be silently discarded.'},owner.cookie)).statusCode,409);assert.equal((await request('POST','/compliance/records',record({expected_revision:1}),owner.cookie)).statusCode,400);
 const {client_reference:ignored,...missing}=body;void ignored;assert.equal((await request('POST','/compliance/records',missing,owner.cookie)).statusCode,400);
 const detail=await request('GET','/compliance/records/'+eventRecord,{},owner.cookie);assert.equal(detail.statusCode,200);assert.equal(detail.json().title,body.title);assert.equal(detail.headers['cache-control'],'private, no-store');assert.equal((await request('GET','/compliance/records/'+eventRecord,{},customer.cookie)).statusCode,403);
});

test('concurrent record edits enforce persisted revisions and preserve before/after private history',async()=>{
 const body=record();const created=(await request('POST','/compliance/records',body,owner.cookie)).json();const {client_reference:ignored,...editable}=body;void ignored;
 const replies=await Promise.all([request('PATCH','/compliance/records/'+created.id,{...editable,title:'First concurrent assessment',expected_revision:1},owner.cookie),request('PATCH','/compliance/records/'+created.id,{...editable,title:'Second concurrent assessment',expected_revision:1},owner.cookie)]);assert.deepEqual(replies.map(r=>r.statusCode).sort(),[200,409]);
 const saved=(await request('GET','/compliance/records/'+created.id,{},owner.cookie)).json();assert.equal(saved.revision,2);const history=(await request('GET','/compliance/history?record_id='+created.id,{},owner.cookie)).json();assert.equal(history.length,2);const change=history.find((h:{event:string})=>h.event==='record.updated');assert.equal(change.envelope.detail.before.title,body.title);assert.equal(change.envelope.detail.snapshot.title,saved.title);assert.equal(change.actor_id,owner.user.id);
});

test('evidence imports are idempotent, preserve owner edits and keep policy HTML sanitized',async()=>{
 const external_key='governance-fixture:'+suffix,imported={kind:'policy',title:'Synthetic draft evidence policy',status:'draft',data:{html:'<h2>Safe draft</h2><script>notSafe()</script><p onclick="bad()">Pending owner review.</p>'},assessment_note:'Private source import, no approval asserted.',external_key};
 const first=await request('POST','/compliance/import',{records:[imported]},owner.cookie);assert.equal(first.statusCode,200,first.body);assert.equal(first.json().added,1);
 const list=(await request('GET','/compliance/records?kind=policy&search='+encodeURIComponent('Synthetic draft evidence policy'),{},owner.cookie)).json();const r=list.records.find((r:{external_key:string})=>r.external_key===external_key);assert.ok(r);importedId=r.id;assert.doesNotMatch(r.data.html,/script|onclick|notSafe/);
 assert.equal((await request('PATCH','/compliance/records/'+r.id,{kind:'policy',title:'Owner edited private policy',status:'draft',data:{html:'<p>Owner-controlled edited draft.</p>'},expected_revision:1,assessment_note:'Preserve this owner edit on future imports.'},owner.cookie)).statusCode,200);
 const repeat=await request('POST','/compliance/import',{records:[{...imported,title:'Reimport must not replace owner title'}]},owner.cookie);assert.equal(repeat.statusCode,200);assert.equal(repeat.json().added,0);assert.equal(repeat.json().unchanged,1);assert.equal((await request('GET','/compliance/records/'+r.id,{},owner.cookie)).json().title,'Owner edited private policy');
 for(const status of['tested','verified_production','not_applicable'])assert.equal((await request('POST','/compliance/records',record({status,data:{}}),owner.cookie)).statusCode,400);
 assert.equal((await request('POST','/compliance/records',record({status:'approved'}),owner.cookie)).statusCode,400);
});

test('append-only compliance history has a valid independently calculated hash chain',async()=>{
 const rows=(await pool.query('SELECT * FROM compliance_events ORDER BY id')).rows;let previous='GENESIS';
 const canonical=(v:unknown):string=>v===null||typeof v!=='object'?(JSON.stringify(v)??'null'):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v as object).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';
 for(const row of rows){assert.equal(row.previous_hash,previous);const expected=createHash('sha256').update(previous+'\n'+canonical(row.envelope)).digest('hex');assert.equal(row.entry_hash,expected);previous=row.entry_hash;}
 assert.equal((await request('GET','/compliance/history/verify',{},owner.cookie)).json().valid,true);
 await assert.rejects(pool.query("UPDATE compliance_events SET event='rewritten' WHERE record_id=$1",[eventRecord]),/append-only/i);await assert.rejects(pool.query('DELETE FROM compliance_events WHERE record_id=$1',[importedId]),/append-only/i);
});

test('incident clocks require reportability and controller awareness with independent six-hour and72-hour deadlines',async()=>{
 const draft=incident(),r=await request('POST','/compliance/incidents',draft,owner.cookie);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().id,draft.client_reference);assert.deepEqual(r.json().clocks,{certin:null,eu_authority:null,uk_authority:null,processor_urgency:null});
 const {client_reference:ignored,...edit}=draft;void ignored;const reportable={...edit,certin_decision:'reportable',gdpr_decision:'notify_authority',uk_decision:'notify_authority',role:'controller',aware_at:'2026-01-01T02:00:00+05:30',expected_revision:1};const assessed=await request('PATCH','/compliance/incidents/'+draft.client_reference,reportable,owner.cookie);assert.equal(assessed.statusCode,200,assessed.body);assert.deepEqual(assessed.json().clocks,{certin:'2026-01-01T01:30:00.000Z',eu_authority:'2026-01-03T20:30:00.000Z',uk_authority:'2026-01-03T20:30:00.000Z',processor_urgency:null});
 assert.equal((await request('PATCH','/compliance/incidents/'+draft.client_reference,reportable,owner.cookie)).statusCode,409);
 for(const b of[incident({gdpr_decision:'notify_authority',role:'controller',aware_at:null}),incident({gdpr_decision:'notify_authority',role:'processor',aware_at:'2026-01-01T02:00:00Z'}),incident({discovered_at:'2099-01-01T00:00:00Z'})])assert.equal((await request('POST','/compliance/incidents',b,owner.cookie)).statusCode,400);
 const processor=await request('POST','/compliance/incidents',incident({role:'processor',gdpr_decision:'processor_notify_client'}),owner.cookie);assert.equal(processor.statusCode,200);assert.equal(processor.json().clocks.eu_authority,null);assert.match(processor.json().clocks.processor_urgency,/without undue delay/);
 const noRisk=await request('POST','/compliance/incidents',incident({role:'controller',gdpr_decision:'unlikely_risk',uk_decision:'not_applicable'}),owner.cookie);assert.equal(noRisk.statusCode,200);assert.equal(noRisk.json().clocks.eu_authority,null);
});

test('incident create retry has one history record and only generic deduplicated notification jobs',async()=>{
 const body=incident({title:'PRIVATE-INCIDENT-TITLE-'+suffix,data:{restricted_detail:'PRIVATE-INCIDENT-DATA-'+suffix}});const results=await Promise.all([request('POST','/compliance/incidents',body,owner.cookie),request('POST','/compliance/incidents',body,owner.cookie)]);for(const r of results)assert.equal(r.statusCode,200,r.body);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM compliance_events WHERE record_id=$1 AND event='incident.created'",[body.client_reference])).rows[0].n,1);
 const notices=(await pool.query('SELECT * FROM compliance_notices WHERE resource_id=$1',[body.client_reference])).rows;assert.equal(notices.length,1);
 const queued=(await pool.query("SELECT * FROM outbox WHERE dedupe_key LIKE $1",['compliance:'+notices[0].id+':%'])).rows;assert.ok(queued.length>=1);assert.ok(queued.every(r=>r.template==='compliance_alert'));assert.ok(!JSON.stringify(queued).includes('PRIVATE-INCIDENT-'));
 assert.equal((await request('POST','/compliance/incidents',{...body,severity:'critical'},owner.cookie)).statusCode,409);assert.equal((await request('POST','/compliance/incidents',{...body,assessment_note:'This changed incident rationale must not be treated as saved.'},owner.cookie)).statusCode,409);
});

test('owner privacy assessments keep internal reasoning private and publish only deliberate customer responses',async()=>{
 const submitted=await request('POST','/privacy/requests',{type:'erasure',description:'Please review my synthetic personal information for eligible erasure.',client_reference:randomUUID()},customer.cookie);assert.equal(submitted.statusCode,200,submitted.body);privacyId=submitted.json().request.id;
 const assessment={expected_revision:1,status:'in_review',customer_response:'Your request is being reviewed; no deletion has been performed.',admin_note:'PRIVATE-OWNER-LEGAL-REASON-'+suffix,framework:'Applicability under review',due_date:'2026-12-16'};
 const saved=await request('PATCH','/compliance/privacy-requests/'+privacyId,assessment,owner.cookie);assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().revision,2);assert.equal((await request('PATCH','/compliance/privacy-requests/'+privacyId,assessment,owner.cookie)).statusCode,409);
 const visible=await request('GET','/privacy/requests/'+privacyId,{},customer.cookie);assert.equal(visible.statusCode,200);assert.ok(!visible.body.includes(assessment.admin_note));assert.ok(visible.json().history.some((e:{body:string})=>e.body===assessment.customer_response));assert.equal(visible.json().erasure_review.destructive_actions_enabled,false);
 assert.equal((await request('GET','/privacy/requests/'+privacyId,{},other.cookie)).statusCode,404);const privateHistory=await request('GET','/compliance/privacy-requests/'+privacyId+'/history',{},owner.cookie);assert.ok(privateHistory.body.includes(assessment.admin_note));
 assert.equal((await request('PATCH','/compliance/privacy-requests/'+privacyId,{...assessment,expected_revision:2,status:'fulfilled',customer_response:'short'},owner.cookie)).statusCode,400);
 assert.equal((await pool.query('SELECT disabled_at FROM users WHERE id=$1',[customer.user.id])).rows[0].disabled_at,null);
});

test('retention dry-runs require documented owner approval and never delete data or execute unapproved rules',async()=>{
 const [lead]=(await pool.query("INSERT INTO leads(title,email,brief,created_at) VALUES('Synthetic retention QA','qa@example.test','Synthetic record for a dry-run only',now()-interval '5 days') RETURNING id")).rows;
 const payload=record({kind:'retention',status:'draft',data:{category:'leads',period_days:1,legal_hold:false,purpose:'Synthetic retention purpose for dry-run validation.',approval_reference:'Owner QA fixture authorization only.'}}),created=await request('POST','/compliance/records',payload,owner.cookie);assert.equal(created.statusCode,200,created.body);const id=created.json().id;
 assert.equal((await request('POST','/compliance/retention/dry-run',{policy_id:id},owner.cookie)).statusCode,409);const {client_reference:ignored,...edit}=payload;void ignored;assert.equal((await request('PATCH','/compliance/records/'+id,{...edit,status:'approved',owner_review_approved:true,expected_revision:1},owner.cookie)).statusCode,200);
 const before=Number((await pool.query('SELECT count(*) AS n FROM leads')).rows[0].n),run=await request('POST','/compliance/retention/dry-run',{policy_id:id},owner.cookie);assert.equal(run.statusCode,200,run.body);assert.equal(run.json().mode,'dry_run');assert.ok(run.json().candidate_count>=1);assert.equal(run.json().detail.record_deletion_performed,false);assert.equal(Number((await pool.query('SELECT count(*) AS n FROM leads')).rows[0].n),before);assert.equal((await pool.query('SELECT count(*)::int AS n FROM leads WHERE id=$1',[lead.id])).rows[0].n,1);
 assert.equal((await request('POST','/compliance/retention/execute',{policy_id:id},owner.cookie)).statusCode,404);assert.equal((await request('DELETE','/compliance/records/'+id,{},owner.cookie)).statusCode,404);
});

test('request logging stores canonical routes and encrypted addresses without passwords, queries, bodies or sessions',async()=>{
 const secret='NEVER-LOG-THIS-SYNTHETIC-'+randomUUID();const r=await request('POST','/auth/login?private_query='+secret,{email:'missing-'+suffix+'@example.test',password:secret});assert.equal(r.statusCode,401,r.body);
 const logs=(await pool.query('SELECT * FROM security_request_events ORDER BY id DESC LIMIT 1000')).rows;assert.ok(logs.some(l=>l.route==='/auth/login'&&l.status===401));const serialized=JSON.stringify(logs);assert.ok(!serialized.includes(secret));assert.ok(!serialized.includes(customer.cookie));assert.ok(!serialized.includes(password));assert.ok(logs.every(l=>!l.route.includes('?')));
 const row=logs.find(l=>l.route==='/auth/login'&&l.status===401);assert.match(row.address_hash,/^[a-f0-9]{64}$/);const [iv,tag,encrypted]=row.address_encrypted.split(':');const key=createHmac('sha256',Buffer.from(process.env.MFA_ENCRYPTION_KEY!,'hex')).update('anibish-security-log-v1').digest(),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));assert.match(Buffer.concat([decipher.update(Buffer.from(encrypted,'hex')),decipher.final()]).toString(),/^127\.61\./);
 await assert.rejects(pool.query("UPDATE security_request_events SET route='/rewritten' WHERE id=$1",[row.id]),/append-only/i);
 const listing=await request('GET','/compliance/security-events',{},owner.cookie);assert.equal(listing.statusCode,200);assert.ok(!listing.body.includes('address_encrypted'));assert.ok(!listing.body.includes(secret));
});

test('reminder retries preserve one notice per key without disclosing sensitive records or transmitting regulator reports',async()=>{
 await pool.query("UPDATE privacy_requests SET due_date=(now() AT TIME ZONE 'Asia/Kolkata')::date-2 WHERE id=$1",[privacyId]);await runComplianceReminders();await runComplianceReminders();
 const notices=(await pool.query('SELECT * FROM compliance_notices WHERE dedupe_key=$1',['privacy-overdue:'+privacyId])).rows;assert.equal(notices.length,1);assert.ok(!JSON.stringify(notices).includes('PRIVATE-OWNER-LEGAL-REASON'));
 const overview=(await request('GET','/compliance/overview',{},owner.cookie)).json();assert.match(overview.regulatory_reporting,/manual/);assert.match(overview.deletion_execution,/disabled/);assert.match(overview.readiness,/no overall compliance percentage/);assert.equal(overview.date_only_reminder_timezone,'Asia/Kolkata');
});


test('governance records, revision history and scoped privacy responses survive an application restart',async()=>{
 const before=(await request('GET','/compliance/records/'+eventRecord,{},owner.cookie)).json();await app.close();app=await buildServer();
 const after=await request('GET','/compliance/records/'+eventRecord,{},owner.cookie);assert.equal(after.statusCode,200,after.body);assert.deepEqual(after.json(),before);assert.equal((await request('GET','/compliance/history/verify',{},owner.cookie)).json().valid,true);
 const own=await request('GET','/privacy/requests/'+privacyId,{},customer.cookie);assert.equal(own.statusCode,200);assert.ok(!own.body.includes('PRIVATE-OWNER-LEGAL-REASON'));assert.equal((await request('GET','/privacy/requests/'+privacyId,{},other.cookie)).statusCode,404);
});


test('worker escalates critical edits, imported high-risk providers, overdue tasks and recorded access changes once',async()=>{
 const v=record({kind:'vulnerability',data:{severity:'high',private_detail:'RESTRICTED-FINDING-'+suffix}});assert.equal((await request('POST','/compliance/records',v,owner.cookie)).statusCode,200);const {client_reference:ignored,...edit}=v;void ignored;
 assert.equal((await request('PATCH','/compliance/records/'+v.client_reference,{...edit,data:{...v.data,severity:'critical'},expected_revision:1},owner.cookie)).statusCode,200);
 const provider={external_key:'synthetic-risk-provider:'+suffix,kind:'processor',title:'Synthetic unapproved provider',status:'awaiting_external_evidence',data:{risk:'high'},assessment_note:'A synthetic private assessment for notification testing.'};assert.equal((await request('POST','/compliance/import',{records:[provider]},owner.cookie)).statusCode,200);
 const task=record({kind:'remediation',data:{due_date:'2020-01-01'}});assert.equal((await request('POST','/compliance/records',task,owner.cookie)).statusCode,200);
 const access=(await pool.query("INSERT INTO audit_log(org_id,actor_id,action,resource) VALUES($1,$2,'team.role_granted',$3) RETURNING id",[owner.user.org_id,owner.user.id,randomUUID()])).rows[0];
 await runComplianceReminders();await runComplianceReminders();
 for(const key of ['priority:'+v.client_reference+':2','task-overdue:'+task.client_reference+':1','access-change:'+access.id])assert.equal((await pool.query('SELECT count(*)::int AS n FROM compliance_notices WHERE dedupe_key=$1',[key])).rows[0].n,1);
 const providerRow=(await pool.query('SELECT id FROM compliance_records WHERE external_key=$1',[provider.external_key])).rows[0];assert.equal((await pool.query('SELECT count(*)::int AS n FROM compliance_notices WHERE dedupe_key=$1',['priority:'+providerRow.id+':1'])).rows[0].n,1);
 const alerts=(await pool.query("SELECT payload FROM outbox WHERE template='compliance_alert'")).rows;assert.ok(!JSON.stringify(alerts).includes('RESTRICTED-FINDING-'));
});
