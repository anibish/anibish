import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {pool} from './db';

const safeText=(max:number)=>z.string().min(1).max(max).refine(value=>value.trim().length>0);
const contentSchema=z.object({
 category:z.literal('Freelance Client Projects'),description:safeText(600),body:safeText(12000),
 role:safeText(250),project_status:safeText(250),technologies:z.array(safeText(80)).max(20),
 features:z.array(safeText(500)).max(40),client_display:z.literal('').default(''),
 featured:z.literal(false).default(false),evidence_attested:z.literal(false).default(false),
 sources:z.array(z.never()).max(0).default([]),mode:z.literal('enhance').default('enhance'),
}).strict();
const seoSchema=z.object({title:safeText(250).optional(),description:safeText(600).optional(),noindex:z.literal(true).default(true)}).strict();
const payloadSchema=z.object({records:z.array(z.object({
 external_key:z.string().min(1).max(250),expected_source_hash:z.string().regex(/^[a-f0-9]{64}$/),
 slug:z.string().regex(/^portfolio\/historical-delivery-[a-f0-9]{20}$/),title:safeText(250),
 content:contentSchema,seo:seoSchema.default({noindex:true}),
}).strict()).min(1).max(200)}).strict();
type Proposal=z.infer<typeof payloadSchema>['records'][number];
type ImportCode='INVALID_PAYLOAD'|'UNSAFE_PUBLIC_CONTENT'|'SOURCE_NOT_FOUND'|'SOURCE_HASH_CONFLICT'|'SOURCE_NOT_COMPLETED'|'SOURCE_MAPPING_CONFLICT'|'TARGET_ALREADY_EXISTS'|'TARGET_GROUP_CONFLICT'|'PRIVATE_INPUT_REQUIRED'|'DATABASE_REQUIRED';
export class PortfolioDraftImportError extends Error{
 constructor(readonly code:ImportCode){super(code);this.name='PortfolioDraftImportError'}
}
export function historicalDeliverySlug(externalKey:string){return 'portfolio/historical-delivery-'+createHash('sha256').update('anibish-historical-delivery-v1:'+externalKey).digest('hex').slice(0,20)}

// This conservative allowlist is for anonymous owner-review drafts, not a
// general rich-content importer. Provenance never belongs in public CMS JSON.
function validatePublicFields(record:Proposal){
 if(record.slug!==historicalDeliverySlug(record.external_key))throw new PortfolioDraftImportError('INVALID_PAYLOAD');
 const text=JSON.stringify({title:record.title,content:record.content,seo:record.seo});
 const withoutDates=text.replace(/\b\d{4}-\d{2}-\d{2}\b/g,'');
 const forbidden=[/https?:\/\/|www\.|mailto:|ftp:\/\/|file:\/\//i,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b[a-z0-9-]+\.(?:com|net|org|in|io|co|uk|edu|gov|app|dev|info|biz|me|pro|ai)\b/i,
  /\bFO[0-9A-F]{6,}\b/i,/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\b[0-9a-f]{32,}\b/i,/<[^>]+>/,/BEGIN[\s-]+(?:RSA[\s-]+|EC[\s-]+|OPENSSH[\s-]+)?PRIVATE KEY/i,
  /(?:api[_ -]?key|password|secret|token)\s*[:=]/i,/₹|\$\s*\d|\b(?:USD|INR|EUR|GBP)\s*\d/i];
 if(forbidden.some(pattern=>pattern.test(text))||/(?:^|[^\w])\+?\d(?:[\d(). \t-]*\d){7,}(?!\w)/.test(withoutDates)||text.toLowerCase().includes(record.external_key.toLowerCase()))throw new PortfolioDraftImportError('UNSAFE_PUBLIC_CONTENT');
}
export function parsePortfolioDraftPayload(payload:unknown){
 const parsed=payloadSchema.safeParse(payload);if(!parsed.success)throw new PortfolioDraftImportError('INVALID_PAYLOAD');
 const seenSources=new Set<string>(),seenSlugs=new Set<string>();
 for(const record of parsed.data.records){
  if(seenSources.has(record.external_key)||seenSlugs.has(record.slug))throw new PortfolioDraftImportError('INVALID_PAYLOAD');
  seenSources.add(record.external_key);seenSlugs.add(record.slug);validatePublicFields(record);
 }
 return parsed.data;
}
export interface PortfolioDraftImportResult{dry_run:boolean;received:number;created:number;would_create:number;preserved:number;records:{external_key:string;slug:string;result:'would_create'|'created'|'preserved';page_id?:string}[]}

/** Trusted private maintenance only. There is deliberately no HTTP route. */
export async function importPortfolioDrafts(payload:unknown,dryRun=true):Promise<PortfolioDraftImportResult>{
 if(typeof dryRun!=='boolean')throw new PortfolioDraftImportError('INVALID_PAYLOAD');
 const input=parsePortfolioDraftPayload(payload),db=await pool.connect();
 const result:PortfolioDraftImportResult={dry_run:dryRun,received:input.records.length,created:0,would_create:0,preserved:0,records:[]};
 try{
  await db.query('BEGIN');
  // Consistent lock ordering handles concurrent batches sharing sources/slugs.
  const locks=input.records.flatMap(r=>['portfolio-draft-source:fiverr:'+r.external_key,'portfolio-draft-slug:'+r.slug]).sort();
  for(const lock of locks)await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);
  for(const proposal of [...input.records].sort((a,b)=>a.external_key.localeCompare(b.external_key))){
   const source=(await db.query("SELECT id,source_hash,page_id,facts FROM portfolio_sources WHERE provider='fiverr' AND external_key=$1 FOR UPDATE",[proposal.external_key])).rows[0];
   if(!source)throw new PortfolioDraftImportError('SOURCE_NOT_FOUND');
   if(source.source_hash!==proposal.expected_source_hash)throw new PortfolioDraftImportError('SOURCE_HASH_CONFLICT');
   if(source.facts?.status!=='completed')throw new PortfolioDraftImportError('SOURCE_NOT_COMPLETED');
   const page=(await db.query('SELECT id,slug,kind FROM cms_pages WHERE slug=$1 FOR UPDATE',[proposal.slug])).rows[0];
   if(source.page_id){
    if(!page||page.id!==source.page_id||page.kind!=='portfolio')throw new PortfolioDraftImportError('SOURCE_MAPPING_CONFLICT');
    const others=await db.query('SELECT id FROM portfolio_sources WHERE page_id=$1 AND id<>$2',[page.id,source.id]);
    if(others.rowCount)throw new PortfolioDraftImportError('TARGET_GROUP_CONFLICT');
    result.preserved++;result.records.push({external_key:proposal.external_key,slug:proposal.slug,result:'preserved',page_id:page.id});continue;
   }
   if(page)throw new PortfolioDraftImportError('TARGET_ALREADY_EXISTS');
   if(dryRun){result.would_create++;result.records.push({external_key:proposal.external_key,slug:proposal.slug,result:'would_create'});continue}
   const created=(await db.query("INSERT INTO cms_pages(slug,title,kind,state,content,seo,updated_by) VALUES($1,$2,'portfolio','draft',$3,$4,NULL) ON CONFLICT(slug) DO NOTHING RETURNING id",[proposal.slug,proposal.title,proposal.content,proposal.seo])).rows[0];
   // A CMS writer does not use our advisory lock. Never attach an ambiguous
   // concurrently created owner page or silently replace its content.
   if(!created)throw new PortfolioDraftImportError('TARGET_ALREADY_EXISTS');
   await db.query('UPDATE portfolio_sources SET page_id=$1,updated_at=now() WHERE id=$2',[created.id,source.id]);
   await db.query("INSERT INTO cms_revisions(page_id,revision,event,content,seo,actor_id) VALUES($1,1,'system_draft_imported',$2,$3,NULL)",[created.id,proposal.content,proposal.seo]);
   const proposalHash=createHash('sha256').update(JSON.stringify(proposal)).digest('hex');
   await db.query("INSERT INTO audit_log(actor_id,action,resource,detail) VALUES(NULL,'portfolio.system_draft_imported',$1,$2)",[created.id,{source_id:source.id,provider:'fiverr',external_key:proposal.external_key,expected_source_hash:proposal.expected_source_hash,proposal_hash:proposalHash,importer:'portfolio-draft-import-v1',reason:'Anonymous historical delivery record prepared from private completed-order evidence for owner review.',publication_authorized:false,owner_approval:false,evidence_attested:false,state:'draft'}]);
   result.created++;result.records.push({external_key:proposal.external_key,slug:proposal.slug,result:'created',page_id:created.id});
  }
  await db.query(dryRun?'ROLLBACK':'COMMIT');return result;
 }catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
}

async function privateInput(path:string){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await file.stat();if(!stat.isFile()||stat.size>2*1024*1024||(stat.mode&0o077)!==0||(process.getuid&&stat.uid!==process.getuid()))throw new PortfolioDraftImportError('PRIVATE_INPUT_REQUIRED');return JSON.parse(await file.readFile('utf8'))}finally{await file.close()}
}
async function cli(){
 try{
  const args=process.argv.slice(2),mode=args[0];
  if(args.length!==3||!['--dry-run','--apply'].includes(mode)||args[1]!=='--input')throw new PortfolioDraftImportError('INVALID_PAYLOAD');
  if(!process.env.DATABASE_URL)throw new PortfolioDraftImportError('DATABASE_REQUIRED');
  const input=await privateInput(args[2]),r=await importPortfolioDrafts(input,mode==='--dry-run');
  console.log(JSON.stringify({dry_run:r.dry_run,received:r.received,created:r.created,would_create:r.would_create,preserved:r.preserved}));
 }catch(error){console.error(JSON.stringify({error:error instanceof PortfolioDraftImportError?error.code:'IMPORT_FAILED'}));process.exitCode=1}finally{await pool.end()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void cli();
