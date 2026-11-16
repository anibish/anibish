import type {FastifyInstance} from 'fastify';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {pool,transaction} from './db';
import {fail} from './security';
import type {Actor,DomainContext} from './context';

function canonical(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const object=value as Record<string,unknown>;
 return '{'+Object.keys(object).sort().map(key=>JSON.stringify(key)+':'+canonical(object[key])).join(',')+'}';
}
export const portfolioContentHash=(content:unknown)=>createHash('sha256').update(canonical(content)).digest('hex');
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const uid=z.string().uuid().transform(value=>value.toLowerCase());
const batch=z.object({
 client_reference:uid,
 publication_rights_confirmed:z.literal(true),
 content_review_confirmed:z.literal(true),
 entries:z.array(z.object({id:uid,expected_revision:z.number().int().positive(),expected_content_hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(100)
}).strict().refine(value=>new Set(value.entries.map(entry=>entry.id)).size===value.entries.length,'Select each portfolio entry only once.');
type Page={id:string;slug:string;title:string;kind:string;state:string;revision:number;content:Record<string,unknown>;published_content:Record<string,unknown>|null;seo:Record<string,unknown>;published_seo:Record<string,unknown>|null};
type Source={id:string;provider:string;external_key:string;title:string;clearance:string;page_id:string|null;status:string};
type PublicationResult={published:number;already_published:number;replayed:boolean;entries:{id:string;slug:string;revision:number;content_hash:string}[];message:string};

async function audit(db:PoolClient,actor:Actor,action:string,resource:string,detail:unknown){
 await db.query('INSERT INTO audit_log(org_id,actor_id,action,resource,detail) VALUES($1,$2,$3,$4,$5)',[actor.org_id||null,actor.id,action,resource,JSON.stringify(detail)]);
}
function validateCanonical(seo:Record<string,unknown>){
 if(seo.canonical===undefined||seo.canonical==='')return;
 if(typeof seo.canonical!=='string'||seo.canonical.length>250)fail(400,'Provide a valid canonical URL for each selected entry.');
 try{const url=new URL(seo.canonical as string);if(url.origin!=='https://anibish.com'||url.username||url.password)fail(400,'Canonical URLs must use the verified anibish.com domain.');}
 catch(error){if((error as {statusCode?:number}).statusCode)throw error;fail(400,'Provide a valid canonical URL for each selected entry.');}
}
function mediaIds(content:Record<string,unknown>){
 const ids:unknown[]=[];
 if(content.media_ids!==undefined){if(!Array.isArray(content.media_ids))fail(400,'Gallery media must be an array of approved media references.');ids.push(...content.media_ids as unknown[]);}
 if(content.blocks!==undefined){if(!Array.isArray(content.blocks))fail(400,'Content blocks must be an array.');for(const block of content.blocks as unknown[]){const id=object(block).media_id;if(id!==undefined)ids.push(id);}}
 return ids.map(id=>uid.parse(id));
}

export function registerPortfolioPublication(app:FastifyInstance,c:DomainContext){
 const owner=async(req:Parameters<DomainContext['actor']>[0])=>{const actor=await c.actor(req,'portfolio',true);if(actor.global_role!=='super_admin'||!c.staff(actor)||!actor.mfa_enabled||!actor.mfa_verified)fail(403,'Portfolio publication requires Super Admin MFA.');return actor;};

 app.get('/portfolio-sources/coverage',async(req,reply)=>{
  await owner(req);reply.header('Cache-Control','private, no-store');
  const sources=(await pool.query<Source>("SELECT id,provider,external_key,title,clearance,page_id,lower(COALESCE(facts->>'status','')) AS status FROM portfolio_sources ORDER BY provider,title,id")).rows;
  const pages=(await pool.query<Page>("SELECT id,slug,title,kind,state,revision,content,published_content,seo,published_seo FROM cms_pages WHERE kind='portfolio' ORDER BY title,id")).rows;
  const byId=new Map(pages.map(page=>[page.id,page]));
  const completed=sources.filter(source=>source.provider==='fiverr'&&source.status==='completed');
  const linkedPublished=completed.filter(source=>source.page_id&&byId.get(source.page_id)?.state==='published'&&byId.get(source.page_id)?.published_content!==null);
  const linkedDraft=completed.filter(source=>source.page_id&&byId.get(source.page_id)?.state==='draft');
  const linkedArchived=completed.filter(source=>source.page_id&&byId.get(source.page_id)?.state==='archived');
  const clearanceCounts:Record<string,number>={};for(const source of sources)clearanceCounts[source.clearance]=(clearanceCounts[source.clearance]||0)+1;
  return {
   counts:{completed_orders:completed.length,cancelled_orders:sources.filter(source=>source.provider==='fiverr'&&['cancelled','canceled'].includes(source.status)).length,github_repositories:sources.filter(source=>source.provider==='github').length,published_portfolio:pages.filter(page=>page.state==='published'&&page.published_content!==null).length,completed_orders_with_published_portfolio:linkedPublished.length,completed_orders_with_draft:linkedDraft.length,completed_orders_with_archived_portfolio:linkedArchived.length,completed_orders_unlinked:completed.filter(source=>!source.page_id||!byId.has(source.page_id)).length},
   source_clearance_counts:clearanceCounts,
   pages:pages.map(page=>({id:page.id,slug:page.slug,title:page.title,kind:'portfolio' as const,state:page.state,revision:page.revision,content_hash:portfolioContentHash(page.content),content:page.content,seo:page.seo,source_count:sources.filter(source=>source.page_id===page.id).length,source_completed_count:completed.filter(source=>source.page_id===page.id).length,evidence_attested:page.content.evidence_attested===true,saved_changes_not_live:canonical(page.content)!==canonical(page.published_content)||canonical(page.seo)!==canonical(page.published_seo)})),
   unlinked_sources:sources.filter(source=>!source.page_id||!byId.has(source.page_id)).map(source=>({id:source.id,provider:source.provider,title:source.title,external_key:source.external_key,status:source.status,clearance:source.clearance})),
   notice:'Counts describe source orders and repository associations, not unique projects or clients. Source clearance is separate from approval of a sanitized public case. Private originals, messages, requirements, order IDs and private repository contents are never cleared by this publication action.'
  };
 });

 app.post('/portfolio-sources/publish-batch',async(req,reply)=>{
  const actor=await owner(req),input=batch.parse(req.body);reply.header('Cache-Control','private, no-store');
  const entries=[...input.entries].sort((one,two)=>one.id.localeCompare(two.id));
  const requestHash=portfolioContentHash({entries,publication_rights_confirmed:input.publication_rights_confirmed,content_review_confirmed:input.content_review_confirmed});
  return transaction(async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['portfolio-publication:'+actor.id+':'+input.client_reference]);
   const prior=(await db.query("SELECT detail FROM audit_log WHERE actor_id=$1 AND action='portfolio.batch_published' AND resource=$2 ORDER BY id LIMIT 1",[actor.id,input.client_reference])).rows[0];
   if(prior){if(prior.detail.request_hash!==requestHash)fail(409,'This publication reference belongs to different reviewed entries. Refresh the saved records before starting another publication.');return {...prior.detail.result,replayed:true,message:'The earlier selected publication is confirmed. Later owner edits were not overwritten.'} as PublicationResult;}
   const locked=(await db.query<Page>('SELECT id,slug,title,kind,state,revision,content,published_content,seo,published_seo FROM cms_pages WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[entries.map(entry=>entry.id)])).rows;
   const byId=new Map(locked.map(page=>[page.id,page]));const images=new Set<string>();
   for(const entry of entries){
    const page=byId.get(entry.id);if(!page)fail(404,'A selected portfolio entry is no longer available. Refresh the coverage view.');
    if(page.kind!=='portfolio')fail(400,'Batch publication accepts portfolio entries only.');
    if(page.state==='archived')fail(409,'An archived entry requires deliberate restoration through its individual CMS controls.');
    if(page.revision!==entry.expected_revision||portfolioContentHash(page.content)!==entry.expected_content_hash)fail(409,'A selected draft changed. Nothing was published. Refresh and review the current content before trying again.');
    if(page.state==='published'&&(page.content.evidence_attested!==true||canonical(page.content)!==canonical(page.published_content)||canonical(page.seo)!==canonical(page.published_seo)))fail(409,'A published entry with saved changes requires individual CMS review. Its existing public snapshot was not changed.');
    validateCanonical(object(page.seo));for(const id of mediaIds(object(page.content)))images.add(id);
   }
   if(images.size){const approved=(await db.query('SELECT id FROM files WHERE id=ANY($1::uuid[]) AND public_approved=true AND internal=false ORDER BY id FOR SHARE',[[...images].sort()])).rows;if(approved.length!==images.size)fail(400,'Every selected image requires its own public delivery approval. Private or internal files cannot be published.');}
   const result:PublicationResult={published:0,already_published:0,replayed:false,entries:[],message:'The selected reviewed portfolio entries are published. Private source permissions were not changed.'};
   for(const entry of entries){
    const page=byId.get(entry.id)!;const content=object(page.content),seo=object(page.seo);
    if(page.state==='published'&&content.evidence_attested===true&&canonical(content)===canonical(page.published_content)&&canonical(seo)===canonical(page.published_seo)){
     result.already_published++;result.entries.push({id:page.id,slug:page.slug,revision:page.revision,content_hash:portfolioContentHash(content)});continue;
    }
    const attested={...content,evidence_attested:true};let revision=page.revision;
    if(content.evidence_attested!==true){
     revision++;
     await db.query('UPDATE cms_pages SET content=$1,revision=$2,updated_by=$3,updated_at=now() WHERE id=$4',[JSON.stringify(attested),revision,actor.id,page.id]);
     await db.query("INSERT INTO cms_revisions(page_id,revision,event,content,seo,actor_id) VALUES($1,$2,'portfolio_bulk_reviewed',$3,$4,$5)",[page.id,revision,JSON.stringify(attested),JSON.stringify(seo),actor.id]);
    }
    await db.query("UPDATE cms_pages SET state='published',published_content=$1,published_seo=$2,published_at=now(),updated_at=now(),updated_by=$3 WHERE id=$4",[JSON.stringify(attested),JSON.stringify(seo),actor.id,page.id]);
    await db.query("INSERT INTO cms_revisions(page_id,revision,event,content,seo,actor_id) VALUES($1,$2,'published',$3,$4,$5)",[page.id,revision,JSON.stringify(attested),JSON.stringify(seo),actor.id]);
    await audit(db,actor,'cms.published',page.id,{source:'portfolio_batch',client_reference:input.client_reference,publication_scope:'selected_public_summary_only'});
    result.published++;result.entries.push({id:page.id,slug:page.slug,revision,content_hash:portfolioContentHash(attested)});
   }
   if(!result.published)result.message='Every selected reviewed entry was already public. No content or publication history was duplicated.';
   await audit(db,actor,'portfolio.batch_published',input.client_reference,{request_hash:requestHash,result,publication_scope:'selected_public_summary_only',source_clearances_changed:0});
   return result;
  });
 });
}
