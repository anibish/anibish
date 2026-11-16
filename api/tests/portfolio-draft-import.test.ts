import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chmod,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pool} from '../db';
import {migrate} from '../migrate';
import {buildServer} from '../server';
import {historicalDeliverySlug,importPortfolioDrafts,parsePortfolioDraftPayload,PortfolioDraftImportError} from '../portfolio-draft-import';

let app:Awaited<ReturnType<typeof buildServer>>,ownerId:string;
const exec=promisify(execFile);
before(async()=>{
 const url=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
 if(!url||!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(url.pathname))throw Error('A dedicated guarded local QA database is required.');
 process.env.MFA_ENCRYPTION_KEY=randomBytes(32).toString('hex');await migrate();app=await buildServer();
 ownerId=(await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',['draft-owner-'+randomUUID()+'@example.test','Synthetic draft owner','unusable-'+randomUUID()])).rows[0].id;
});
after(async()=>{await app?.close();await pool.end()});
async function source(status='completed',provider='fiverr'){
 const key='FO'+randomBytes(8).toString('hex').toUpperCase(),facts={status,private_message:'Synthetic private message must not enter CMS content',order_identifier:key},hash=createHash('sha256').update(JSON.stringify(facts)).digest('hex');
 return (await pool.query("INSERT INTO portfolio_sources(provider,external_key,title,facts,source_hash,owner_notes) VALUES($1,$2,'Synthetic private order',$3,$4,'Preserve private owner note') RETURNING *",[provider,key,facts,hash])).rows[0];
}
function proposal(s:{external_key:string;source_hash:string}){return {external_key:s.external_key,expected_source_hash:s.source_hash,slug:historicalDeliverySlug(s.external_key),title:'Historical website engineering delivery',content:{category:'Freelance Client Projects',description:'A scoped historical website delivery record.',body:'The inspected delivery summary supports website engineering work. This is a historical delivery record, not a count of unique products.',role:'Freelance software developer',project_status:'Historical delivery record — owner review pending',technologies:['WordPress'],features:['Website engineering delivery'],client_display:'',featured:false,evidence_attested:false,sources:[]},seo:{title:'Historical website engineering delivery',description:'Owner-review draft of historical work.',noindex:true}}}
const payload=(...records:ReturnType<typeof proposal>[])=>({records});
const rejects=(value:unknown,code:string)=>assert.rejects(importPortfolioDrafts(value,false),(error:unknown)=>error instanceof PortfolioDraftImportError&&error.code===code);
async function page(slug:string){return (await pool.query('SELECT * FROM cms_pages WHERE slug=$1',[slug])).rows[0]}

test('dry-run is the default and performs no content, mapping, revision or audit writes',async()=>{
 const s=await source(),p=proposal(s),before=(await pool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n;
 const r=await importPortfolioDrafts(payload(p));assert.equal(r.dry_run,true);assert.equal(r.created,0);assert.equal(r.would_create,1);assert.equal(await page(p.slug),undefined);
 assert.deepEqual((await pool.query('SELECT * FROM portfolio_sources WHERE id=$1',[s.id])).rows[0],s);assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n,before);
});
test('apply creates only an anonymous private draft with truthful system revision and private provenance',async()=>{
 const s=await source(),p=proposal(s),r=await importPortfolioDrafts(payload(p),false),saved=await page(p.slug);assert.equal(r.created,1);assert.equal(saved.state,'draft');assert.equal(saved.published_content,null);assert.equal(saved.published_at,null);assert.equal(saved.updated_by,null);assert.equal(saved.revision,1);assert.equal(saved.content.evidence_attested,false);assert.equal(saved.content.mode,'enhance');assert.equal(saved.content.client_display,'');assert.deepEqual(saved.content.sources,[]);assert.equal(saved.seo.noindex,true);
 for(const privateValue of[s.id,s.external_key,s.source_hash,s.facts.private_message])assert.equal(JSON.stringify(saved.content).includes(privateValue),false);
 const linked=(await pool.query('SELECT * FROM portfolio_sources WHERE id=$1',[s.id])).rows[0];assert.equal(linked.page_id,saved.id);for(const key of['facts','source_hash','clearance','owner_notes','title','imported_at'])assert.deepEqual(linked[key],s[key]);
 const rev=(await pool.query('SELECT * FROM cms_revisions WHERE page_id=$1',[saved.id])).rows;assert.equal(rev.length,1);assert.equal(rev[0].event,'system_draft_imported');assert.equal(rev[0].actor_id,null);assert.deepEqual(rev[0].content,saved.content);
 const audit=(await pool.query("SELECT * FROM audit_log WHERE resource=$1 AND action='portfolio.system_draft_imported'",[saved.id])).rows;assert.equal(audit.length,1);assert.equal(audit[0].actor_id,null);assert.equal(audit[0].detail.owner_approval,false);assert.equal(audit[0].detail.publication_authorized,false);assert.equal(audit[0].detail.source_id,s.id);assert.equal(audit[0].detail.expected_source_hash,s.source_hash);
});
test('identical replay preserves content and emits no duplicate draft, revision or provenance record',async()=>{
 const s=await source(),p=proposal(s);await importPortfolioDrafts(payload(p),false);const before=await page(p.slug);const r=await importPortfolioDrafts(payload(p),false);assert.equal(r.created,0);assert.equal(r.preserved,1);assert.deepEqual(await page(p.slug),before);assert.equal((await pool.query('SELECT count(*)::int AS n FROM cms_revisions WHERE page_id=$1',[before.id])).rows[0].n,1);assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE resource=$1 AND action='portfolio.system_draft_imported'",[before.id])).rows[0].n,1);
});
test('concurrent same-source imports serialize to one draft and one source mapping',async()=>{
 const s=await source(),p=proposal(s),results=await Promise.all(Array.from({length:4},()=>importPortfolioDrafts(payload(p),false)));assert.equal(results.reduce((n,r)=>n+r.created,0),1);assert.equal(results.reduce((n,r)=>n+r.preserved,0),3);const saved=await page(p.slug);assert.equal((await pool.query('SELECT page_id FROM portfolio_sources WHERE id=$1',[s.id])).rows[0].page_id,saved.id);assert.equal((await pool.query('SELECT count(*)::int AS n FROM cms_revisions WHERE page_id=$1',[saved.id])).rows[0].n,1);
});
test('reimport never overwrites owner edits, publication snapshots, clearance or private notes',async()=>{
 const s=await source(),p=proposal(s);await importPortfolioDrafts(payload(p),false);const original=await page(p.slug);
 await pool.query("UPDATE cms_pages SET title='Manual owner title',state='published',revision=7,content=$1,published_content=$2,seo=$3,published_seo=$4,updated_by=$5,published_at=now() WHERE id=$6",[{body:'Owner working text',evidence_attested:false},{body:'Preserved approved public snapshot',evidence_attested:true},{title:'Working SEO'},{title:'Published SEO'},ownerId,original.id]);
 await pool.query("UPDATE portfolio_sources SET clearance='cleared',owner_notes='Manual clearance note' WHERE id=$1",[s.id]);const before=await page(p.slug),sourceBefore=(await pool.query('SELECT * FROM portfolio_sources WHERE id=$1',[s.id])).rows[0];p.content.body='New proposed wording must not overwrite the owner.';
 const r=await importPortfolioDrafts(payload(p),false);assert.equal(r.preserved,1);assert.deepEqual(await page(p.slug),before);assert.deepEqual((await pool.query('SELECT * FROM portfolio_sources WHERE id=$1',[s.id])).rows[0],sourceBefore);
});
test('a source hash conflict rolls back the entire batch and preserves source facts',async()=>{
 const a=await source(),b=await source(),pa=proposal(a),pb=proposal(b);pb.expected_source_hash='0'.repeat(64);await rejects(payload(pa,pb),'SOURCE_HASH_CONFLICT');assert.equal(await page(pa.slug),undefined);assert.equal(await page(pb.slug),undefined);assert.equal((await pool.query('SELECT page_id FROM portfolio_sources WHERE id=$1',[a.id])).rows[0].page_id,null);assert.deepEqual((await pool.query('SELECT facts FROM portfolio_sources WHERE id=$1',[b.id])).rows[0].facts,b.facts);
});
test('cancelled, absent and non-Fiverr evidence cannot create portfolio drafts',async()=>{
 const cancelled=await source('cancelled');await rejects(payload(proposal(cancelled)),'SOURCE_NOT_COMPLETED');const github=await source('completed','github');await rejects(payload(proposal(github)),'SOURCE_NOT_FOUND');const absent={external_key:'FO'+randomBytes(8).toString('hex'),source_hash:'a'.repeat(64)};await rejects(payload(proposal(absent)),'SOURCE_NOT_FOUND');
});
test('existing published mapping, unrelated target or multi-source group is never reassigned',async()=>{
 const mapped=await source(),pm=proposal(mapped),existing=(await pool.query("INSERT INTO cms_pages(slug,title,kind,state,content,published_content) VALUES($1,'Existing approved collection','portfolio','published','{}','{}') RETURNING id",['portfolio/qa-group-'+randomBytes(8).toString('hex')])).rows[0];await pool.query('UPDATE portfolio_sources SET page_id=$1 WHERE id=$2',[existing.id,mapped.id]);await rejects(payload(pm),'SOURCE_MAPPING_CONFLICT');assert.equal(await page(pm.slug),undefined);assert.equal((await pool.query('SELECT page_id FROM portfolio_sources WHERE id=$1',[mapped.id])).rows[0].page_id,existing.id);
 const collision=await source(),pc=proposal(collision);await pool.query("INSERT INTO cms_pages(slug,title,kind,content) VALUES($1,'Owner-created draft','portfolio',$2)",[pc.slug,{body:'Never replace owner work'}]);await rejects(payload(pc),'TARGET_ALREADY_EXISTS');assert.equal((await page(pc.slug)).content.body,'Never replace owner work');
 const grouped=await source(),pg=proposal(grouped);await importPortfolioDrafts(payload(pg),false);const extra=await source();await pool.query('UPDATE portfolio_sources SET page_id=$1 WHERE id=$2',[(await page(pg.slug)).id,extra.id]);await rejects(payload(pg),'TARGET_GROUP_CONFLICT');
});
test('strict public allowlist rejects rights, provenance, identities, URLs, contact details and raw identifiers',()=>{
 const p=proposal({external_key:'FO1234567890ABCDEF',source_hash:'a'.repeat(64)});
 const cases:[(x:typeof p)=>unknown,string][]=[
  [x=>{x.content.evidence_attested=true},'INVALID_PAYLOAD'],[x=>Object.assign(x.content,{source_id:randomUUID()}),'INVALID_PAYLOAD'],
  [x=>{x.content.client_display='Private username'},'INVALID_PAYLOAD'],[x=>{x.content.body='Visit https://private.example.test/file'},'UNSAFE_PUBLIC_CONTENT'],
  [x=>{x.content.body='Write to person@example.test'},'UNSAFE_PUBLIC_CONTENT'],[x=>{x.content.body='Call +91 98765 43210'},'UNSAFE_PUBLIC_CONTENT'],
  [x=>{x.content.body='Completed '+x.external_key},'UNSAFE_PUBLIC_CONTENT'],[x=>{x.content.body='Reference '+randomUUID()},'UNSAFE_PUBLIC_CONTENT'],
  [x=>{x.content.body='<a href="private">Raw HTML</a>'},'UNSAFE_PUBLIC_CONTENT'],[x=>{x.content.body='password=synthetic-only'},'UNSAFE_PUBLIC_CONTENT'],
  [x=>{x.content.body='Transaction USD 123'},'UNSAFE_PUBLIC_CONTENT'],[x=>Object.assign(x.seo,{canonical:'https://example.test'}),'INVALID_PAYLOAD'],
  [x=>{x.slug='portfolio/historical-delivery-'+'0'.repeat(20)},'INVALID_PAYLOAD'],[x=>{x.title='   '},'INVALID_PAYLOAD'],
 ];
 for(const [mutate,code]of cases){const copy=structuredClone(p);mutate(copy);assert.throws(()=>parsePortfolioDraftPayload(payload(copy)),(error:unknown)=>error instanceof PortfolioDraftImportError&&error.code===code)}
 assert.throws(()=>parsePortfolioDraftPayload(payload(p,p)),(error:unknown)=>error instanceof PortfolioDraftImportError&&error.code==='INVALID_PAYLOAD');
});
test('anonymous public site excludes imported drafts and no HTTP import route is introduced',async()=>{
 const s=await source(),p=proposal(s);await importPortfolioDrafts(payload(p),false);const response=await app.inject({method:'GET',url:'/public/site'});assert.equal(response.statusCode,200);assert.equal(response.json().pages.some((r:{slug:string})=>r.slug===p.slug),false);assert.equal(response.body.includes(s.external_key),false);assert.equal((await app.inject({method:'POST',url:'/portfolio-draft-import',headers:{'x-studio-client':'web',origin:'http://localhost:3000'},payload:{}})).statusCode,404);
});
test('additive nullable-system-actor migration preserves existing actor attribution and its foreign key',async()=>{
 const db=await pool.connect(),schema='qa_draft_'+randomBytes(8).toString('hex');try{await db.query('BEGIN');await db.query('CREATE SCHEMA '+schema);await db.query('SET LOCAL search_path TO '+schema);await db.query('CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE cms_revisions(id integer,actor_id uuid NOT NULL REFERENCES users(id))');await db.query('INSERT INTO users(id) VALUES($1)',[ownerId]);await db.query('INSERT INTO cms_revisions VALUES(1,$1)',[ownerId]);await db.query(await readFile(new URL('../migrations/043_cms_system_revision_actor.sql',import.meta.url),'utf8'));await db.query('INSERT INTO cms_revisions VALUES(2,NULL)');assert.equal((await db.query('SELECT actor_id FROM cms_revisions WHERE id=1')).rows[0].actor_id,ownerId);await db.query('SAVEPOINT invalid_actor');await assert.rejects(db.query('INSERT INTO cms_revisions VALUES(3,$1)',[randomUUID()]),(error:unknown)=>(error as {code:string}).code==='23503');await db.query('ROLLBACK TO SAVEPOINT invalid_actor')}finally{await db.query('ROLLBACK');db.release()}
});
test('CLI requires explicit mode and owner-private input, emits counts only and defaults to no public changes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'anibish-draft-import-')),file=join(dir,'private.json'),s=await source(),p=proposal(s);try{await writeFile(file,JSON.stringify(payload(p)),{mode:0o600});const r=await exec(process.execPath,['--import','tsx','api/portfolio-draft-import.ts','--dry-run','--input',file],{cwd:process.cwd(),env:process.env});assert.deepEqual(JSON.parse(r.stdout),{dry_run:true,received:1,created:0,would_create:1,preserved:0});assert.equal(r.stdout.includes(s.external_key),false);assert.equal(r.stdout.includes(p.slug),false);assert.equal(await page(p.slug),undefined);
  await assert.rejects(exec(process.execPath,['--import','tsx','api/portfolio-draft-import.ts','--input',file],{cwd:process.cwd(),env:process.env}),(error:unknown)=>{const e=error as {stderr:string};assert.equal(JSON.parse(e.stderr).error,'INVALID_PAYLOAD');assert.equal(e.stderr.includes(s.external_key),false);return true});
  await chmod(file,0o644);await assert.rejects(exec(process.execPath,['--import','tsx','api/portfolio-draft-import.ts','--dry-run','--input',file],{cwd:process.cwd(),env:process.env}),(error:unknown)=>JSON.parse((error as {stderr:string}).stderr).error==='PRIVATE_INPUT_REQUIRED');
 }finally{await rm(dir,{recursive:true,force:true})}
});
