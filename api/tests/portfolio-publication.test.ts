import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {portfolioContentHash} from '../portfolio-publication';
import {accountTokenFromLink} from './account-link-fixture';
import {freshTotp} from './auth-factor-fixture';

let app:Awaited<ReturnType<typeof buildServer>>;
const suffix=randomUUID().replaceAll('-','').slice(0,10),password='Portfolio-qa-'+randomUUID();
const address='127.'+(80+parseInt(suffix.slice(0,2),16)%160)+'.'+parseInt(suffix.slice(2,4),16)+'.31';
const headers={origin:'http://localhost:3000','x-studio-client':'web','content-type':'application/json'};
async function request(method:'GET'|'POST'|'PATCH',path:string,body:unknown={},cookie=''){
 return app.inject({method,url:path,remoteAddress:address,headers:{...headers,...cookie?{cookie}:{}},...method==='GET'?{}:{payload:JSON.stringify(body)}});
}
function cookieOf(value:string|string[]|undefined){const values=Array.isArray(value)?value:value?[value]:[];const session=values.find(v=>/^(?:__Host-)?anibish_session=[^;]/.test(v));assert.ok(session);return session.split(';')[0]}
async function account(label:string){
 const email='publication-'+label+'-'+suffix+'@example.test';const created=await request('POST','/auth/register',{name:label,email,password});assert.equal(created.statusCode,201);
 assert.equal((await request('POST','/auth/token',{token:accountTokenFromLink(created.json().development_link)})).statusCode,200);
 const signed=await request('POST','/auth/login',{email,password});assert.equal(signed.statusCode,200);const cookie=cookieOf(signed.headers['set-cookie']);return {cookie,user:(await request('GET','/auth/me',{},cookie)).json().user};
}
let owner:Awaited<ReturnType<typeof account>>,customer:typeof owner,lesser:typeof owner,unenrolled:typeof owner;
before(async()=>{
 const url=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
 if(!url||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(url.pathname)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('Strict local-only QA database required.');
 await migrate();app=await buildServer();owner=await account('owner');customer=await account('customer');lesser=await account('lesser');unenrolled=await account('unenrolled');
 for(const user of[owner,unenrolled])await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[user.user.id]);
 await pool.query("UPDATE users SET global_role='support' WHERE id=$1",[lesser.user.id]);
 const setup=await request('POST','/auth/mfa/setup',{password},owner.cookie);assert.equal(setup.statusCode,200);
 const verified=await request('POST','/auth/mfa/verify',{password,code:freshTotp(setup.json().secret)},owner.cookie);assert.equal(verified.statusCode,200);owner.cookie=cookieOf(verified.headers['set-cookie']);
});
after(async()=>{await app?.close();await pool.end()});
async function page(label:string,extra:Record<string,unknown>={}){
 const slug='portfolio/qa-'+suffix+'-'+randomUUID().slice(0,8),content={description:'Synthetic reviewed public scope.',body:'Synthetic portfolio fixture without private evidence.',category:'Historical Professional Work',evidence_attested:false,...extra};
 const row=(await pool.query("INSERT INTO cms_pages(slug,title,kind,content,updated_by) VALUES($1,$2,'portfolio',$3,$4) RETURNING *",[slug,label,content,owner.user.id])).rows[0];
 await pool.query("INSERT INTO cms_revisions(page_id,revision,event,content,seo,actor_id) VALUES($1,1,'created',$2,'{}',$3)",[row.id,content,owner.user.id]);return row;
}
const selection=(p:{id:string;revision:number;content:unknown})=>({id:p.id,expected_revision:p.revision,expected_content_hash:portfolioContentHash(p.content)});
const body=(pages:{id:string;revision:number;content:unknown}[],client_reference=randomUUID())=>({client_reference,publication_rights_confirmed:true,content_review_confirmed:true,entries:pages.map(selection)});
async function source(p:{id:string}|null,status='completed'){
 return (await pool.query("INSERT INTO portfolio_sources(provider,external_key,title,facts,source_hash,page_id) VALUES('fiverr',$1,'Synthetic private source',$2,$3,$4) RETURNING *",['private-'+randomUUID(),{status,customer_username:'same-public-fixture',private_evidence:'PRIVATE-FACTS-NEVER-COVERAGE-'+suffix},'a'.repeat(64),p?.id||null])).rows[0];
}

test('portfolio coverage and batch publication require a real MFA Super Admin and keep draft/evidence private',async()=>{
 const draft=await page('Private draft '+suffix);await source(draft);
 for(const [cookie,status]of[['',401],[customer.cookie,403],[lesser.cookie,403],[unenrolled.cookie,403]] as const){
  assert.equal((await request('GET','/portfolio-sources/coverage',{},cookie)).statusCode,status);
  assert.equal((await request('POST','/portfolio-sources/publish-batch',body([draft]),cookie)).statusCode,status);
 }
 const coverage=await request('GET','/portfolio-sources/coverage',{},owner.cookie);assert.equal(coverage.statusCode,200);assert.match(String(coverage.headers['cache-control']),/no-store/);assert.ok(!coverage.body.includes('PRIVATE-FACTS-NEVER-COVERAGE-'));
 assert.ok(!(await request('GET','/public/site')).json().pages.some((p:{slug:string})=>p.slug===draft.slug));
});

test('coverage counts actual status and explicit associations without assuming one source equals one project',async()=>{
 const before=(await request('GET','/portfolio-sources/coverage',{},owner.cookie)).json().counts;
 const draft=await page('Mapped draft '+suffix),published=await page('Mapped published '+suffix,{evidence_attested:true});
 await pool.query("UPDATE cms_pages SET state='published',published_content=content,published_seo=seo WHERE id=$1",[published.id]);
 await source(draft,'Completed');await source(published);await source(null);await source(null,'cancelled');
 await pool.query("INSERT INTO portfolio_sources(provider,external_key,title,facts,source_hash) VALUES('github',$1,'Synthetic repository','{}',$2)",[randomUUID(),'b'.repeat(64)]);
 const coverage=(await request('GET','/portfolio-sources/coverage',{},owner.cookie)).json(),counts=coverage.counts;
 for(const [key,delta]of Object.entries({completed_orders:3,cancelled_orders:1,github_repositories:1,published_portfolio:1,completed_orders_with_published_portfolio:1,completed_orders_with_draft:1,completed_orders_unlinked:1}))assert.equal(counts[key]-before[key],delta,key);
 const row=coverage.pages.find((p:{id:string})=>p.id===draft.id);assert.equal(row.source_completed_count,1);assert.equal(row.content_hash,portfolioContentHash(draft.content));assert.equal(row.state,'draft');assert.match(coverage.notice,/not unique projects/);
});

test('batch publication requires both explicit confirmations and rejects nonportfolio, archived and duplicate entries',async()=>{
 const draft=await page('Validation '+suffix),payload=body([draft]);
 for(const flag of['publication_rights_confirmed','content_review_confirmed']){assert.equal((await request('POST','/portfolio-sources/publish-batch',{...payload,[flag]:false},owner.cookie)).statusCode,400);const missing={...payload} as Record<string,unknown>;delete missing[flag];assert.equal((await request('POST','/portfolio-sources/publish-batch',missing,owner.cookie)).statusCode,400)}
 assert.equal((await request('POST','/portfolio-sources/publish-batch',{...payload,entries:[...payload.entries,...payload.entries]},owner.cookie)).statusCode,400);
 await pool.query("UPDATE cms_pages SET kind='blog' WHERE id=$1",[draft.id]);assert.equal((await request('POST','/portfolio-sources/publish-batch',payload,owner.cookie)).statusCode,400);
 await pool.query("UPDATE cms_pages SET kind='portfolio',state='archived' WHERE id=$1",[draft.id]);assert.equal((await request('POST','/portfolio-sources/publish-batch',payload,owner.cookie)).statusCode,409);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM cms_revisions WHERE page_id=$1',[draft.id])).rows[0].n,1);
});

test('a stale revision or changed content hash rolls back every selected entry without changing public snapshots',async()=>{
 const one=await page('Atomic one '+suffix),two=await page('Atomic two '+suffix),payload=body([one,two]);
 await pool.query("UPDATE cms_pages SET revision=revision+1,content=jsonb_set(content,'{body}','\"Later owner edit\"') WHERE id=$1",[two.id]);
 assert.equal((await request('POST','/portfolio-sources/publish-batch',payload,owner.cookie)).statusCode,409);
 for(const p of[one,two]){const row=(await pool.query('SELECT * FROM cms_pages WHERE id=$1',[p.id])).rows[0];assert.equal(row.state,'draft');assert.equal(row.published_content,null);assert.equal(row.content.evidence_attested,false)}
 const fresh=await page('Hash guarded '+suffix);await pool.query("UPDATE cms_pages SET content=jsonb_set(content,'{body}','\"Changed without revision\"') WHERE id=$1",[fresh.id]);
 assert.equal((await request('POST','/portfolio-sources/publish-batch',body([fresh]),owner.cookie)).statusCode,409);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='portfolio.batch_published' AND resource=$1",[payload.client_reference])).rows[0].n,0);
});

test('publication records only the reviewed public draft and leaves private source clearance and facts unchanged',async()=>{
 const draft=await page('Reviewed publication '+suffix),linked=await source(draft),result=await request('POST','/portfolio-sources/publish-batch',body([draft]),owner.cookie);assert.equal(result.statusCode,200,result.body);assert.equal(result.json().published,1);
 const saved=(await pool.query('SELECT * FROM cms_pages WHERE id=$1',[draft.id])).rows[0];assert.equal(saved.state,'published');assert.equal(saved.revision,2);assert.equal(saved.content.evidence_attested,true);assert.deepEqual(saved.content,saved.published_content);
 const original=(await pool.query('SELECT * FROM portfolio_sources WHERE id=$1',[linked.id])).rows[0];assert.equal(original.clearance,'pending');assert.deepEqual(original.facts,linked.facts);
 const publicPage=(await request('GET','/public/site')).json().pages.find((p:{slug:string})=>p.slug===draft.slug);assert.ok(publicPage);assert.ok(!JSON.stringify(publicPage).includes('PRIVATE-FACTS-NEVER-COVERAGE-'));assert.ok(!JSON.stringify(publicPage).includes(linked.external_key));
 const history=(await pool.query('SELECT event,actor_id FROM cms_revisions WHERE page_id=$1 ORDER BY id',[draft.id])).rows;assert.deepEqual(history.map(r=>r.event),['created','portfolio_bulk_reviewed','published']);assert.ok(history.every(r=>r.actor_id===owner.user.id));
});

test('concurrent exact retries and reordered entries publish once while changed input and later owner edits remain protected',async()=>{
 const one=await page('Replay one '+suffix),two=await page('Replay two '+suffix),payload=body([one,two]),responses=await Promise.all([request('POST','/portfolio-sources/publish-batch',payload,owner.cookie),request('POST','/portfolio-sources/publish-batch',{...payload,entries:[...payload.entries].reverse()},owner.cookie)]);
 for(const r of responses)assert.equal(r.statusCode,200,r.body);assert.deepEqual(responses.map(r=>r.json().replayed).sort(),[false,true]);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='portfolio.batch_published' AND resource=$1",[payload.client_reference])).rows[0].n,1);
 for(const p of[one,two])assert.equal((await pool.query("SELECT count(*)::int AS n FROM cms_revisions WHERE page_id=$1 AND event='published'",[p.id])).rows[0].n,1);
 assert.equal((await request('POST','/portfolio-sources/publish-batch',{...payload,entries:[{...payload.entries[0],expected_content_hash:'f'.repeat(64)},payload.entries[1]]},owner.cookie)).statusCode,409);
 await pool.query("UPDATE cms_pages SET revision=revision+1,content=jsonb_set(content,'{body}','\"Owner work after publication\"') WHERE id=$1",[one.id]);
 const replay=await request('POST','/portfolio-sources/publish-batch',payload,owner.cookie);assert.equal(replay.statusCode,200);assert.equal(replay.json().replayed,true);
 const latest=(await pool.query('SELECT * FROM cms_pages WHERE id=$1',[one.id])).rows[0];assert.equal(latest.content.body,'Owner work after publication');assert.notEqual(latest.published_content.body,latest.content.body);
 assert.equal((await request('POST','/portfolio-sources/publish-batch',body([latest]),owner.cookie)).statusCode,409);
});

test('private/internal media and invalid canonicals block the entire batch before any public change',async()=>{
 const file=(await pool.query("INSERT INTO files(org_id,name,mime,size,storage_key,user_id,sha256,internal) VALUES($1,'synthetic.png','image/png',8,$2,$3,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',true) RETURNING id",[owner.user.org_id,'qa-'+randomUUID(),owner.user.id])).rows[0];
 const good=await page('Media atomic good '+suffix),blocked=await page('Media atomic blocked '+suffix,{media_ids:[file.id]});
 assert.equal((await request('POST','/portfolio-sources/publish-batch',body([good,blocked]),owner.cookie)).statusCode,400);
 await pool.query('UPDATE files SET internal=false WHERE id=$1',[file.id]);assert.equal((await request('POST','/portfolio-sources/publish-batch',body([good,blocked]),owner.cookie)).statusCode,400);
 await pool.query('UPDATE files SET public_approved=true WHERE id=$1',[file.id]);const allowed=await request('POST','/portfolio-sources/publish-batch',body([blocked]),owner.cookie);assert.equal(allowed.statusCode,200,allowed.body);
 const bad=await page('Invalid canonical '+suffix);await pool.query('UPDATE cms_pages SET seo=$1 WHERE id=$2',[{canonical:'https://unapproved.example/private'},bad.id]);assert.equal((await request('POST','/portfolio-sources/publish-batch',body([good,bad]),owner.cookie)).statusCode,400);
 assert.equal((await pool.query('SELECT state FROM cms_pages WHERE id=$1',[good.id])).rows[0].state,'draft');
});

test('history failure rolls back all page changes, attestations and batch receipts',async()=>{
 const one=await page('Rollback one '+suffix),two=await page('Rollback two '+suffix),payload=body([one,two]),name='qa_portfolio_'+suffix;
 await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.page_id='${two.id}'::uuid AND NEW.event='published' THEN RAISE EXCEPTION 'Synthetic history failure'; END IF; RETURN NEW; END $$`);
 await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON cms_revisions FOR EACH ROW EXECUTE FUNCTION ${name}()`);
 try{assert.equal((await request('POST','/portfolio-sources/publish-batch',payload,owner.cookie)).statusCode,500)}finally{await pool.query(`DROP TRIGGER ${name} ON cms_revisions`);await pool.query(`DROP FUNCTION ${name}()`)}
 for(const p of[one,two]){const saved=(await pool.query('SELECT * FROM cms_pages WHERE id=$1',[p.id])).rows[0];assert.equal(saved.state,'draft');assert.equal(saved.revision,1);assert.equal(saved.content.evidence_attested,false);assert.equal(saved.published_content,null)}
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='portfolio.batch_published' AND resource=$1",[payload.client_reference])).rows[0].n,0);
 const retry=await request('POST','/portfolio-sources/publish-batch',payload,owner.cookie);assert.equal(retry.statusCode,200);assert.equal(retry.json().published,2);
});
