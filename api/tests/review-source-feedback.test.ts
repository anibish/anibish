import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {totp} from '../security';

let app:Awaited<ReturnType<typeof buildServer>>;
const suffix=randomUUID().slice(0,8),password='Local-source-review-'+randomUUID();
const headers={'x-studio-client':'web',origin:'http://localhost:3000'};
const ip='127.28.'+parseInt(suffix.slice(0,2),16)+'.'+parseInt(suffix.slice(2,4),16);
async function call(method:'GET'|'POST'|'PATCH',url:string,body:unknown={},cookie=''){
 return app.inject({method,url,remoteAddress:ip,headers:{...headers,'content-type':'application/json',...(cookie?{cookie}:{})},...(method==='GET'?{}:{payload:JSON.stringify(body)})});
}
async function account(name:string){
 const email=`review-${name}-${suffix}@example.test`;
 const created=await call('POST','/auth/register',{name,email,password,organization:'Isolated review import '+suffix});
 assert.equal(created.statusCode,201,created.body);
 const token=new URL('http://localhost'+created.json().development_link).searchParams.get('token');
 assert.equal((await call('POST','/auth/token',{token})).statusCode,200);
 const login=await call('POST','/auth/login',{email,password});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;
 return {cookie,user};
}
let owner:Awaited<ReturnType<typeof account>>,customer:typeof owner,unverifiedOwner:typeof owner;
const archiveBefore=new Map<string,Record<string,unknown>>();
before(async()=>{
 if(!process.env.DATABASE_URL?.includes('anibish_qa'))throw Error('Review-source tests require the dedicated anibish_qa database.');
 const exists=(await pool.query("SELECT to_regclass('review_candidates') AS present")).rows[0].present;
 if(exists)for(const r of(await pool.query('SELECT * FROM review_candidates')).rows)archiveBefore.set(r.id,r);
 await migrate();app=await buildServer();
 owner=await account('owner');customer=await account('customer');unverifiedOwner=await account('owner-no-mfa');
 for(const user of[owner,unverifiedOwner])await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[user.user.id]);
 const setup=(await call('POST','/auth/mfa/setup',{},owner.cookie)).json();
 assert.equal((await call('POST','/auth/mfa/verify',{code:totp(setup.secret)},owner.cookie)).statusCode,200);
});
after(async()=>{await app?.close();await pool.end();});

function facts(text:string,extra:Record<string,unknown>={}){
 return {status:'completed',detail_inspected:true,activity_inspected:true,review_checked:true,
  confidential_order_note:'PRIVATE ORDER NOTE MUST NOT BE COPIED TO REVIEW EVIDENCE',
  review:{text,rating:5,username:'source-reviewer',reviewed_at:'Jun 21, 2020, 6:42 AM',status:'verified_visible_review',text_scope:'first_visible_review_text_block'},...extra};
}
async function source(text:string,extra:Record<string,unknown>={},key='qa-source-'+randomUUID()){
 const input={provider:'fiverr',external_key:key,title:'Private QA feedback '+suffix,facts:facts(text,extra)};
 const saved=await call('POST','/portfolio-sources/import',{records:[input]},owner.cookie);assert.equal(saved.statusCode,200,saved.body);
 const row=(await pool.query('SELECT * FROM portfolio_sources WHERE provider=$1 AND external_key=$2',['fiverr',key])).rows[0];
 return {...row,input};
}
const importSources=(ids:string[],cookie=owner.cookie)=>call('POST','/review-candidates/import-source-feedback',{source_ids:ids,confirmed:true},cookie);
const editable=['text_truncated','legacy_slug','transcription','reviewer','rating','platform','platform_verified','review_date','category','project_slug','service_slug','duplicate_of','privacy','clearance_note','confidence','featured','revision'];
function payload(row:Record<string,unknown>){const body=Object.fromEntries(editable.map(k=>[k,row[k]]));body.rating=body.rating===null?null:Number(body.rating);return body;}

test('migration preserves every pre-existing candidate and distinguishes real archive identities',async()=>{
 for(const [id,before]of archiveBefore){
  const row=(await pool.query('SELECT * FROM review_candidates WHERE id=$1',[id])).rows[0];
  for(const [key,value]of Object.entries(before))assert.deepEqual(row[key],value,'Migration changed '+id+'.'+key);
  assert.equal(row.source_kind,before.source_kind||'archive');
 }
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM review_candidates WHERE source_kind='archive' AND source_number IS NULL")).rows[0].count,0);
});

test('private feedback import, evidence and history require real Super Admin MFA',async()=>{
 for(const url of['/review-candidates/source-feedback','/review-candidates/not-found/source-evidence','/review-candidates/not-found/history']){
  assert.equal((await call('GET',url)).statusCode,401);
  assert.equal((await call('GET',url,{},customer.cookie)).statusCode,403);
  assert.equal((await call('GET',url,{},unverifiedOwner.cookie)).statusCode,403);
 }
 const body={source_ids:[randomUUID()],confirmed:true};
 assert.equal((await call('POST','/review-candidates/import-source-feedback',body)).statusCode,401);
 assert.equal((await call('POST','/review-candidates/import-source-feedback',body,customer.cookie)).statusCode,403);
 assert.equal((await call('POST','/review-candidates/import-source-feedback',body,unverifiedOwner.cookie)).statusCode,403);
 await pool.query("UPDATE users SET global_role='admin' WHERE id=$1",[owner.user.id]);
 try{assert.equal((await call('GET','/review-candidates/source-feedback',{},owner.cookie)).statusCode,403);}
 finally{await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[owner.user.id]);}
});

test('explicit source selection creates only uncleared private drafts and is concurrently idempotent',async()=>{
 const text='Isolated authentic-source body '+randomUUID(),s=await source(text);
 const result=await Promise.all([importSources([s.id]),importSources([s.id])]);
 for(const r of result)assert.equal(r.statusCode,200,r.body);
 assert.equal(result.reduce((n,r)=>n+r.json().added,0),1);
 assert.equal(result.reduce((n,r)=>n+r.json().unchanged,0),1);
 const id=result[0].json().records[0].candidate_id,row=(await pool.query('SELECT * FROM review_candidates WHERE id=$1',[id])).rows[0];
 assert.match(id,/^feedback-[a-f0-9]{64}$/);assert.equal(row.source_kind,'portfolio_feedback');assert.equal(row.source_number,null);
 assert.equal(row.original_text,text);assert.equal(row.transcription,text);assert.equal(Number(row.rating),5);
 assert.equal(row.reviewer,'Client Review');assert.equal(row.privacy,'needs_review');assert.equal(row.clearance_note,'');assert.equal(row.state,'draft');assert.equal(row.confidence,'unverified');assert.equal(row.text_truncated,true);
 assert.equal((await pool.query('SELECT 1 FROM cms_pages WHERE content->>\'candidate_id\'=$1',[id])).rowCount,0);
 assert.equal((await call('POST','/review-candidates/batch',{ids:[id],action:'approve',confirmed:true},owner.cookie)).statusCode,409);
 const evidence=await call('GET','/review-candidates/'+id+'/source-evidence',{},owner.cookie);assert.equal(evidence.statusCode,200,evidence.body);
 assert.equal(evidence.headers['cache-control'],'private, no-store');assert.equal(evidence.json().evidence[0].captured_review.text,text);assert.equal(evidence.json().evidence[0].publication_rights,'UNCLEARED');
 assert.doesNotMatch(evidence.body,/PRIVATE ORDER NOTE/);
 assert.equal((await call('GET','/review-candidates/'+id+'/evidence',{},owner.cookie)).statusCode,404);
 const listed=(await call('GET','/review-candidates/source-feedback',{},owner.cookie)).json().records.find((r:{source_id:string})=>r.source_id===s.id);
 assert.equal(listed.imported_candidate_id,id);assert.deepEqual(listed.existing_candidate_ids,[id]);
});

test('reimport preserves owner edits and captures changed source versions without inventing a new review',async()=>{
 const s=await source('Versioned source feedback '+randomUUID()),initial=await importSources([s.id]);assert.equal(initial.statusCode,200,initial.body);
 const id=initial.json().records[0].candidate_id,before=(await pool.query('SELECT * FROM review_candidates WHERE id=$1',[id])).rows[0];
 const edit={...payload(before),reviewer:'Owner-confirmed name',transcription:'Owner-edited transcription '+randomUUID(),featured:true};
 const saved=await call('PATCH','/review-candidates/'+id,edit,owner.cookie);assert.equal(saved.statusCode,200,saved.body);
 const unchanged=await importSources([s.id]);assert.equal(unchanged.json().unchanged,1);
 assert.deepEqual(JSON.parse(JSON.stringify((await pool.query('SELECT * FROM review_candidates WHERE id=$1',[id])).rows[0])),saved.json());
 const changed=await source('Updated visible source version '+randomUUID(),{},s.external_key);
 const linked=await importSources([changed.id]);assert.equal(linked.statusCode,200,linked.body);assert.equal(linked.json().added,0);assert.equal(linked.json().linked_existing,1);assert.equal(linked.json().records[0].candidate_id,id);
 const current=(await pool.query('SELECT * FROM review_candidates WHERE id=$1',[id])).rows[0];assert.equal(current.transcription,edit.transcription);assert.equal(current.reviewer,edit.reviewer);assert.equal(current.revision,saved.json().revision);
 assert.equal((await call('GET','/review-candidates/'+id+'/source-evidence',{},owner.cookie)).json().evidence.length,2);
 const history=await call('GET','/review-candidates/'+id+'/history',{},owner.cookie);assert.equal(history.statusCode,200);assert.equal(history.json()[0].event,'edited');assert.equal(history.json()[0].snapshot.transcription,edit.transcription);
 assert.equal((await call('PATCH','/review-candidates/'+id,edit,owner.cookie)).statusCode,409);
});

test('full exact body and rating duplicates link archive evidence without altering owner decisions',async()=>{
 const text='Exact archive-source match '+randomUUID(),id='qa-archive-source-'+randomUUID();
 await pool.query("INSERT INTO review_candidates(id,source_number,transcription,reviewer,rating,privacy,clearance_note,confidence) VALUES($1,9997,$2,'Existing owner name',5,'cleared','Existing authorization stays intact','visually_verified')",[id,text]);
 const before=(await pool.query('SELECT * FROM review_candidates WHERE id=$1',[id])).rows[0],s=await source(text);
 const imported=await importSources([s.id]);assert.equal(imported.statusCode,200,imported.body);assert.equal(imported.json().added,0);assert.equal(imported.json().linked_existing,1);assert.equal(imported.json().records[0].candidate_id,id);
 assert.deepEqual((await pool.query('SELECT * FROM review_candidates WHERE id=$1',[id])).rows[0],before);
 const differentRating=await source(text,{review:{...facts(text).review,rating:4}}),distinct=await importSources([differentRating.id]);assert.equal(distinct.json().added,1);
 const prefix=await source(text+' Longer source body.'),longer=await importSources([prefix.id]);assert.equal(longer.json().added,1);
});

test('ambiguous duplicates and invalid sources roll back the entire selected batch',async()=>{
 const body='Ambiguous source match '+randomUUID();
 for(let n=0;n<2;n++)await pool.query('INSERT INTO review_candidates(id,source_number,transcription,rating) VALUES($1,9996,$2,5)',['qa-ambiguous-'+randomUUID(),body]);
 const ambiguous=await source(body),newSource=await source('Atomic source draft '+randomUUID());
 const result=await importSources([ambiguous.id,newSource.id]);assert.equal(result.statusCode,409,result.body);
 assert.equal((await pool.query('SELECT 1 FROM review_candidate_sources WHERE source_id=ANY($1::uuid[])',[[ambiguous.id,newSource.id]])).rowCount,0);
 const invalid=await source('Cancelled source '+randomUUID(),{status:'cancelled'});
 assert.equal((await importSources([newSource.id,invalid.id])).statusCode,409);
 assert.equal((await pool.query('SELECT 1 FROM review_candidate_sources WHERE source_id=$1',[newSource.id])).rowCount,0);
 const unverified=await source('Unverified rating '+randomUUID(),{review:{text:'Not verified',status:'verified_visible_review'}});
 assert.equal((await importSources([unverified.id])).statusCode,409);
 assert.equal((await call('POST','/review-candidates/import-source-feedback',{source_ids:[newSource.id],confirmed:true,text:'Client-controlled override'},owner.cookie)).statusCode,400);
 assert.equal((await call('POST','/review-candidates/import-source-feedback',{confirmed:true},owner.cookie)).statusCode,400);
 assert.equal((await importSources([newSource.id,newSource.id])).statusCode,400);
});

test('restricted sources and missing immutable source history cannot supply review evidence',async()=>{
 const restricted=await source('Restricted evidence '+randomUUID());
 await pool.query("UPDATE portfolio_sources SET clearance='restricted' WHERE id=$1",[restricted.id]);
 assert.equal((await importSources([restricted.id])).statusCode,409);
 const tampered=await source('History integrity source '+randomUUID());
 await pool.query("UPDATE portfolio_sources SET facts=jsonb_set(facts,'{review,text}',to_jsonb($1::text)) WHERE id=$2",['Changed without a source history record',tampered.id]);
 assert.equal((await importSources([tampered.id])).statusCode,409);
 const list=(await call('GET','/review-candidates/source-feedback',{},owner.cookie)).json();
 assert.equal(list.records.some((r:{source_id:string})=>r.source_id===restricted.id||r.source_id===tampered.id),false);
 assert.ok(list.skipped.source_restricted>=1);assert.ok(list.skipped.source_history_unavailable>=1);
});

test('prospective decision history and source evidence are immutable and publication remains explicit',async()=>{
 const s=await source('Approval history source '+randomUUID(),{review:{...facts('Complete source '+randomUUID()).review,text_scope:'complete_visible_customer_review_block'}});
 const imported=await importSources([s.id]),id=imported.json().records[0].candidate_id;
 const r=(await pool.query('SELECT * FROM review_candidates WHERE id=$1',[id])).rows[0];assert.equal(r.text_truncated,false);
 const saved=await call('PATCH','/review-candidates/'+id,{...payload(r),privacy:'cleared',confidence:'visually_verified',clearance_note:'Isolated QA owner rights and privacy approval.'},owner.cookie);assert.equal(saved.statusCode,200,saved.body);
 for(const action of['approve','publish','unpublish']){const response=await call('POST','/review-candidates/batch',{ids:[id],action,confirmed:true},owner.cookie);assert.equal(response.statusCode,200,response.body);}
 const history=(await call('GET','/review-candidates/'+id+'/history',{},owner.cookie)).json();
 assert.deepEqual(history.slice(0,3).map((v:{event:string})=>v.event),['decision_unpublish','decision_publish','decision_approve']);
 assert.equal(history.find((v:{event:string})=>v.event==='decision_publish').snapshot.transcription,r.transcription);
 await assert.rejects(pool.query("UPDATE review_candidate_versions SET event='tampered' WHERE candidate_id=$1",[id]),/immutable/);
 await assert.rejects(pool.query('DELETE FROM review_candidate_sources WHERE candidate_id=$1',[id]),/immutable/);
 const publicSite=await call('GET','/public/site');assert.doesNotMatch(publicSite.body,new RegExp(s.id));
});
