import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {acceptLegal} from '../legal';
import {fixtureInject,freshTotp} from './auth-factor-fixture';
import {accountTokenFromLink} from './account-link-fixture';

const suffix=randomUUID().slice(0,8),password='Local-DPA-'+randomUUID(),headers={origin:'http://localhost:3000','x-studio-client':'web','content-type':'application/json'};let serial=0;
let app:Awaited<ReturnType<typeof buildServer>>,owner:{cookie:string;user:{id:string}},customer:typeof owner,unenrolled:typeof owner,existingSnapshot:unknown[],publicationId='';
async function call(method:'GET'|'POST'|'PUT',url:string,body:unknown={},cookie=owner?.cookie||''){return fixtureInject(app,{method,url,remoteAddress:'127.89.'+Math.floor(++serial/250)+'.'+serial%250,headers:{...headers,...cookie?{cookie}:{}},...method==='GET'?{}:{payload:JSON.stringify(body)}});}
async function account(label:string,staff=false,enroll=false){const email=`dpa-${label}-${suffix}@example.test`,created=await call('POST','/auth/register',{name:label,email,password},'');assert.equal(created.statusCode,201,created.body);assert.equal((await call('POST','/auth/token',{token:accountTokenFromLink(created.json().development_link)},'')).statusCode,200);const login=await call('POST','/auth/login',{email,password},'');assert.equal(login.statusCode,200,login.body);const cookie=String(login.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;if(staff)await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[user.id]);if(enroll){const setup=(await call('POST','/auth/mfa/setup',{password},cookie)).json();assert.equal((await call('POST','/auth/mfa/verify',{password,code:freshTotp(setup.secret)},cookie)).statusCode,200);}return {cookie,user};}
async function snapshot(){return(await pool.query("SELECT * FROM (SELECT 'version' AS kind,to_jsonb(v) AS record FROM legal_versions v WHERE policy IN('privacy','terms','refunds','cookies') UNION ALL SELECT 'draft',to_jsonb(d) FROM legal_drafts d WHERE policy IN('privacy','terms','refunds','cookies') UNION ALL SELECT 'state',to_jsonb(s) FROM legal_policy_state s WHERE policy IN('privacy','terms','refunds','cookies')) snapshots ORDER BY kind,record::text")).rows;}
const draft=async()=>(await call('GET','/legal')).json().drafts.find((r:{policy:string})=>r.policy==='dpa');
before(async()=>{const url=new URL(process.env.DATABASE_URL||'');if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(url.pathname))throw Error('Dedicated local QA database required.');await migrate();app=await buildServer();owner=await account('owner',true,true);customer=await account('customer');unenrolled=await account('unenrolled',true);existingSnapshot=await snapshot();});
after(async()=>{await app?.close();await pool.end();});

test('additive DPA migration preserves four existing policies and owner draft edits; default DPA has no public approval',async()=>{
 const d=await draft();assert.ok(d);assert.equal((await pool.query("SELECT enabled FROM legal_policy_state WHERE policy='dpa'")).rows[0].enabled,false);assert.equal((await pool.query("SELECT count(*)::int AS n FROM legal_versions WHERE policy='dpa'")).rows[0].n,0);assert.match(d.html,/Owner\/legal review required/);
 const db=await pool.connect();try{await db.query('BEGIN');await db.query("UPDATE legal_drafts SET html='<p>Preserved private owner edit.</p>',revision=revision+1 WHERE policy='dpa'");const before=(await db.query("SELECT * FROM legal_drafts WHERE policy='dpa'")).rows;await db.query(await readFile(new URL('../migrations/044_legal_dpa.sql',import.meta.url),'utf8'));assert.deepEqual((await db.query("SELECT * FROM legal_drafts WHERE policy='dpa'")).rows,before);await db.query('ROLLBACK');}finally{db.release();}
 assert.deepEqual(await snapshot(),existingSnapshot);assert.ok(!(await call('GET','/public/legal',{},'')).json().some((v:{policy:string})=>v.policy==='dpa'));
});
test('DPA draft, publication, archive and restore require the actual MFA Super Admin session',async()=>{
 const d=await draft();for(const [cookie,status]of[['',401],[customer.cookie,403],[unenrolled.cookie,403]] as const){
  assert.equal((await call('PUT','/legal/dpa',{html:'forbidden',revision:d.revision,effective_date:'2026-01-01'},cookie)).statusCode,status);
  for(const action of['publish','restore','archive'])assert.equal((await call('POST','/legal/dpa/'+action,{revision:d.revision,owner_legal_approval:true,material:false,version_id:randomUUID()},cookie)).statusCode,status);
 }
});
test('DPA saved drafts sanitize headings, links, lists and tables; unresolved text and missing approval never publish',async()=>{
 let d=await draft();const html='<h1>DPA — disposable QA draft</h1><p>Owner/legal review required. '+('Confirm the actual parties and client-specific instructions. '.repeat(3))+'</p><ul><li>Scope</li></ul><table><tbody><tr><td>Review</td></tr></tbody></table><a href="javascript:unsafe()" onclick="unsafe()">Unsafe link</a><script>unsafe()</script>';
 const saved=await call('PUT','/legal/dpa',{html,revision:d.revision,effective_date:'2026-01-01'});assert.equal(saved.statusCode,200,saved.body);d=saved.json();assert.doesNotMatch(d.html,/javascript|onclick|script|unsafe\(/);assert.match(d.html,/<table>/);assert.match(d.html,/<ul>/);
 assert.equal((await call('PUT','/legal/dpa',{html,revision:d.revision-1,effective_date:'2026-01-01'})).statusCode,409);
 assert.equal((await call('POST','/legal/dpa/publish',{revision:d.revision,material:false})).statusCode,400);
 assert.equal((await call('POST','/legal/dpa/publish',{revision:d.revision,owner_legal_approval:true,material:false})).statusCode,400);
 assert.ok(!(await call('GET','/public/legal',{},'')).json().some((v:{policy:string})=>v.policy==='dpa'));assert.deepEqual(await snapshot(),existingSnapshot);
});
test('prepared private DPA is discoverable by the existing loader contract without public exposure',async()=>{
 const key='owner-review-document:dpa-review',html='<h1>ISOLATED DPA PREPARED DRAFT</h1><p>Owner/legal review required: synthetic private text only.</p>';
 const imported=await call('POST','/compliance/import',{records:[{external_key:key,kind:'policy',title:'Synthetic DPA owner-review document',status:'draft',data:{id:'dpa-review',html},assessment_note:'Isolated loader contract verification; no legal approval.'}]});assert.equal(imported.statusCode,200,imported.body);
 const records=(await call('GET','/compliance/records?kind=policy&search=dpa-review')).json().records;assert.ok(records.some((r:{external_key:string;data:{html?:string}})=>r.external_key===key&&r.data.html));
 assert.equal((await call('GET','/compliance/records?kind=policy&search=dpa-review',{},customer.cookie)).statusCode,403);assert.ok(!(await call('GET','/public/legal',{},'')).json().some((v:{policy:string})=>v.policy==='dpa'));
});
test('approved isolated DPA uses immutable versions and restoration while four policies remain unchanged',async()=>{
 const d=await draft(),html='<h1>DISPOSABLE QA PROCESSING TEMPLATE</h1><p>'+('This isolated test verifies document publication and is not a signed agreement, legal advice or production approval. '.repeat(3))+'</p>';
 const saved=await call('PUT','/legal/dpa',{html,revision:d.revision,effective_date:'2026-01-01'});assert.equal(saved.statusCode,200,saved.body);
 const published=await call('POST','/legal/dpa/publish',{revision:saved.json().revision,owner_legal_approval:true,material:false});assert.equal(published.statusCode,200,published.body);const v=published.json();publicationId=v.id;
 assert.equal(v.policy,'dpa');assert.equal(v.content_hash,createHash('sha256').update(v.html).digest('hex'));assert.ok((await call('GET','/public/legal',{},'')).json().some((r:{id:string})=>r.id===v.id));assert.equal((await call('GET','/public/legal/'+v.id,{},'')).json().html,html);
 await assert.rejects(pool.query("UPDATE legal_versions SET html='changed' WHERE id=$1",[v.id]),/immutable/);
 const restored=await call('POST','/legal/dpa/restore',{revision:saved.json().revision,version_id:v.id});assert.equal(restored.statusCode,200,restored.body);assert.equal(restored.json().revision,saved.json().revision+1);assert.equal(restored.json().html,html);assert.deepEqual(await snapshot(),existingSnapshot);
});
test('DPA never joins mandatory registration consent; archive leaves acceptance readiness and historical versions intact',async()=>{
 const before=(await call('GET','/legal/acceptance',{},customer.cookie)).json();assert.ok(before.policies.every((p:{policy:string})=>['privacy','terms'].includes(p.policy)));
 const db=await pool.connect();try{await db.query('BEGIN');const ids:Record<string,string>={};for(const policy of['privacy','terms']){ids[policy]=(await db.query("INSERT INTO legal_versions(policy,version,html,content_hash,effective_date,material,actor_id) SELECT $1,COALESCE(max(version),0)+1,'<p>Synthetic isolated consent fixture.</p>',$2,CURRENT_DATE,false,$3 FROM legal_versions WHERE policy=$1 RETURNING id",[policy,'synthetic-'+randomUUID(),owner.user.id])).rows[0].id;await db.query('UPDATE legal_policy_state SET enabled=true WHERE policy=$1',[policy]);}await acceptLegal(db,{legal_acceptance:{accepted:true,privacy:ids.privacy,terms:ids.terms}},customer.user.id,'registration',undefined,true);const accepted=(await db.query("SELECT v.policy FROM legal_consents c JOIN legal_versions v ON v.id=c.policy_version_id WHERE c.user_id=$1 AND c.policy_version_id=ANY($2::uuid[])",[customer.user.id,Object.values(ids)])).rows;assert.deepEqual(accepted.map(r=>r.policy).sort(),['privacy','terms']);assert.equal((await db.query("SELECT count(*)::int AS n FROM legal_consents c JOIN legal_versions v ON v.id=c.policy_version_id WHERE c.user_id=$1 AND v.policy='dpa'",[customer.user.id])).rows[0].n,0);await db.query('ROLLBACK');}finally{db.release();}
 const archived=await call('POST','/legal/dpa/archive');assert.equal(archived.statusCode,200,archived.body);assert.doesNotMatch(archived.json().message,/commitments are blocked/);const after=(await call('GET','/legal/acceptance',{},customer.cookie)).json();assert.equal(after.ready,before.ready);assert.deepEqual(after.policies,before.policies);assert.deepEqual(await snapshot(),existingSnapshot);assert.equal((await call('GET','/public/legal/'+publicationId,{},'')).statusCode,200);assert.ok(!(await call('GET','/public/legal',{},'')).json().some((v:{policy:string})=>v.policy==='dpa'));
});
