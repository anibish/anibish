import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {totp} from '../security';
let app:Awaited<ReturnType<typeof buildServer>>;
const suffix=randomUUID().slice(0,8),password='Isolated-cookie-policy-'+randomUUID();
const ip='127.42.'+parseInt(suffix.slice(0,2),16)+'.'+parseInt(suffix.slice(2,4),16),headers={'x-studio-client':'web',origin:'http://localhost:3000','content-type':'application/json'};
let ownerCookie='',customerCookie='',unenrolledCookie='',prior:unknown[],migrated:unknown[],cookieExisted=false;
async function call(method:'GET'|'POST'|'PUT',url:string,body:unknown={},cookie=ownerCookie){return app.inject({method,url,remoteAddress:ip,headers:{...headers,...(cookie?{cookie}:{})},...(method==='GET'?{}:{payload:JSON.stringify(body)})});}
async function account(name:string,staff=false,mfa=false){
 const email=`cookie-policy-${name}-${suffix}@example.test`,r=await call('POST','/auth/register',{name,email,password,organization:'Isolated cookie policy '+name},'');assert.equal(r.statusCode,201,r.body);
 const token=new URL('http://localhost'+r.json().development_link).searchParams.get('token');assert.equal((await call('POST','/auth/token',{token},'')).statusCode,200);
 const login=await call('POST','/auth/login',{email,password},'');assert.equal(login.statusCode,200,login.body);const cookie=String(login.headers['set-cookie']);
 if(staff){await pool.query("UPDATE users SET global_role='super_admin' WHERE email=$1",[email]);if(mfa){const setup=(await call('POST','/auth/mfa/setup',{},cookie)).json();assert.equal((await call('POST','/auth/mfa/verify',{code:totp(setup.secret)},cookie)).statusCode,200);}}
 return cookie;
}
async function snapshot(){return(await pool.query("SELECT * FROM (SELECT 'version' AS kind,to_jsonb(v) AS record FROM legal_versions v WHERE policy IN('privacy','terms','refunds') UNION ALL SELECT 'draft',to_jsonb(d) FROM legal_drafts d WHERE policy IN('privacy','terms','refunds') UNION ALL SELECT 'state',to_jsonb(s) FROM legal_policy_state s WHERE policy IN('privacy','terms','refunds')) AS snapshots ORDER BY kind,record::text")).rows;}
before(async()=>{
 if(!process.env.DATABASE_URL?.includes('anibish_qa'))throw Error('Legal Cookie Policy tests require the dedicated local anibish_qa database.');
 if(!(await pool.query("SELECT to_regclass('legal_drafts') AS present")).rows[0].present)await migrate();
 // Older QA suites may have removed this public migration fixture. Never rewrite existing CMS edits.
 const fixture={description:'136 completed Fiverr orders, verified in the owner’s completed-order history on 16 November 2026. Repeat orders may belong to the same engagement; this is not a count of unique projects or positive reviews.',completed_order_count:136,verified_on:'2026-11-16',evidence_visibility:'private',mode:'enhance'};
 await pool.query("INSERT INTO cms_pages(slug,title,kind,state,content,published_content,seo,published_seo,published_at) VALUES('freelance-delivery-history','136 completed Fiverr orders','experience','published',$1,$1,'{}','{}',now()) ON CONFLICT(slug) DO NOTHING",[JSON.stringify(fixture)]);
 prior=await snapshot();cookieExisted=Boolean((await pool.query("SELECT 1 FROM legal_drafts WHERE policy='cookies'")).rowCount);
 await migrate();migrated=await snapshot();app=await buildServer();ownerCookie=await account('owner',true,true);customerCookie=await account('customer');unenrolledCookie=await account('unenrolled',true,false);
});
after(async()=>{await app?.close();await pool.end();});
const draft=async()=>(await call('GET','/legal')).json().drafts.find((d:{policy:string})=>d.policy==='cookies');

test('Cookie Policy migration preserves every existing policy record and adds only an unpublished review draft',async()=>{
 assert.deepEqual(migrated,prior);
 const d=await draft();assert.ok(d);if(!cookieExisted){assert.match(d.html,/Owner\/legal review required/);assert.equal((await pool.query("SELECT enabled FROM legal_policy_state WHERE policy='cookies'")).rows[0].enabled,false);assert.equal((await pool.query("SELECT count(*)::int AS n FROM legal_versions WHERE policy='cookies'")).rows[0].n,0);}
});
test('Cookie Policy editor and publication require the real authenticated MFA Super Admin session',async()=>{
 for(const cookie of['',customerCookie,unenrolledCookie]){const status=cookie?403:401;assert.equal((await call('GET','/legal',{},cookie)).statusCode,status);assert.equal((await call('PUT','/legal/cookies',{html:'forbidden',revision:1,effective_date:'2026-11-16'},cookie)).statusCode,status);assert.equal((await call('POST','/legal/cookies/publish',{revision:1,material:false,owner_legal_approval:true},cookie)).statusCode,status);}
});
test('Cookie draft is sanitized, revision guarded and cannot be published with unresolved review text or without approval',async()=>{
 let d=await draft();const html='<h1>Cookie Policy — owner-review draft</h1><p>Owner/legal review required. '+('Confirm the actual browser storage. '.repeat(5))+'</p><script>unsafe()</script><p onclick="unsafe()">Stored safely.</p>';
 const saved=await call('PUT','/legal/cookies',{html,revision:d.revision,effective_date:'2026-01-01'});assert.equal(saved.statusCode,200,saved.body);d=saved.json();assert.doesNotMatch(d.html,/script|onclick|unsafe/);
 assert.equal((await call('PUT','/legal/cookies',{html,revision:d.revision-1,effective_date:'2026-01-01'})).statusCode,409);
 assert.equal((await call('POST','/legal/cookies/publish',{revision:d.revision,material:false})).statusCode,400);
 assert.equal((await call('POST','/legal/cookies/publish',{revision:d.revision,material:false,owner_legal_approval:true})).statusCode,400);
});
test('Approved test Cookie Policy uses immutable publication/history/restore and never changes contractual policy state',async()=>{
 const before=await snapshot(),d=await draft(),html='<h1>Isolated QA Cookie Policy</h1><p>'+('This is a disposable test of policy publication, not legal advice or a production approval. '.repeat(3))+'</p>';
 const saved=await call('PUT','/legal/cookies',{html,revision:d.revision,effective_date:'2026-01-01'});assert.equal(saved.statusCode,200,saved.body);
 const publication=await call('POST','/legal/cookies/publish',{revision:saved.json().revision,material:false,owner_legal_approval:true});assert.equal(publication.statusCode,200,publication.body);const v=publication.json();
 assert.equal(v.policy,'cookies');assert.equal(v.content_hash.length,64);assert.ok((await call('GET','/public/legal',{},'')).json().some((p:{id:string})=>p.id===v.id));
 assert.equal((await call('GET','/public/legal/'+v.id,{},'')).json().html,html);
 await assert.rejects(pool.query("UPDATE legal_versions SET html='replaced' WHERE id=$1",[v.id]),/immutable/);
 assert.equal((await call('POST','/legal/cookies/restore',{version_id:v.id,revision:saved.json().revision})).statusCode,200);
 assert.deepEqual(await snapshot(),before);
});
test('Archiving Cookie Policy leaves current Terms/Privacy acceptance readiness unchanged',async()=>{
 const before=(await call('GET','/legal/acceptance',{},customerCookie)).json(),archive=await call('POST','/legal/cookies/archive');assert.equal(archive.statusCode,200,archive.body);assert.doesNotMatch(archive.json().message,/commitments are blocked/);
 assert.equal((await pool.query("SELECT enabled FROM legal_policy_state WHERE policy='cookies'")).rows[0].enabled,false);
 const after=(await call('GET','/legal/acceptance',{},customerCookie)).json();assert.equal(after.ready,before.ready);assert.deepEqual(after.policies,before.policies);assert.ok(after.policies.every((p:{policy:string})=>p.policy!=='cookies'));
});
