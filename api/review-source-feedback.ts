import {createHash} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {Actor,DomainContext} from './context';
import {pool,transaction} from './db';
import {fail} from './security';

type Candidate={id:string;transcription:string;rating:string|number|null;revision:number;[key:string]:unknown};
type Source={id:string;title:string;provider:string;source_hash:string;clearance:string;history_id:string|null;facts:Record<string,unknown>};
const reviewSchema=z.object({
 text:z.string().min(1).max(20000).refine(v=>Boolean(v.trim())),
 rating:z.number().finite().min(0).max(5),
 status:z.literal('verified_visible_review'),
 username:z.string().max(150).optional(),
 reviewed_at:z.string().max(100).optional(),
 text_scope:z.string().max(150).optional(),
});
type SourceReview=z.infer<typeof reviewSchema>;
const sourceQuery=`SELECT s.*,h.id AS history_id FROM portfolio_sources s
 LEFT JOIN LATERAL(SELECT id FROM portfolio_source_history
 WHERE source_id=s.id AND source_hash=s.source_hash AND facts=s.facts ORDER BY id DESC LIMIT 1) h ON true`;

export function feedbackHash(text:string,rating:number){
 // Whitespace normalization only: no fuzzy identity, service-title or sentiment match.
 return createHash('sha256').update(JSON.stringify([text.normalize('NFKC').replace(/\s+/gu,' ').trim(),rating])).digest('hex');
}
function eligible(source:Source):{review:SourceReview}|{reason:string}{
 if(source.provider!=='fiverr')return {reason:'unsupported_provider'};
 if(['restricted','excluded'].includes(source.clearance))return {reason:'source_restricted'};
 if(source.facts.status!=='completed'||source.facts.detail_inspected!==true||source.facts.activity_inspected!==true)return {reason:'unverified_completed_source'};
 if(!source.history_id||!/^([a-f0-9]{64})$/.test(source.source_hash))return {reason:'source_history_unavailable'};
 const review=reviewSchema.safeParse(source.facts.review);
 if(!review.success||source.facts.review_checked!==true)return {reason:'review_body_or_rating_unverified'};
 return {review:review.data};
}
function candidateMatches(rows:Candidate[],review:SourceReview){
 const hash=feedbackHash(review.text,review.rating);
 return rows.filter(r=>r.rating!==null&&feedbackHash(r.transcription,Number(r.rating))===hash).map(r=>r.id);
}
export async function recordReviewVersion(db:PoolClient,row:Candidate,event:string,actor:Actor|null){
 await db.query('INSERT INTO review_candidate_versions(candidate_id,event,revision,snapshot,actor_id) VALUES($1,$2,$3,$4,$5)',[row.id,event,row.revision,JSON.stringify(row),actor?.id||null]);
}
export async function ensureReviewBaseline(db:PoolClient,row:Candidate,actor:Actor){
 if(!(await db.query('SELECT 1 FROM review_candidate_versions WHERE candidate_id=$1 LIMIT 1',[row.id])).rowCount)await recordReviewVersion(db,row,'first_action_baseline',actor);
}

export async function registerReviewSourceFeedback(app:FastifyInstance,c:DomainContext){
 const owner=async(req:FastifyRequest)=>{
  const a=await c.actor(req,'cms',true);
  if(a.global_role!=='super_admin'||!c.staff(a)||!a.mfa_verified)fail(403,'Super Admin MFA required.');
  return a;
 };
 app.get('/review-candidates/source-feedback',async(req,reply)=>{
  await owner(req);reply.header('Cache-Control','private, no-store');
  const sources=(await pool.query(sourceQuery+" WHERE s.provider='fiverr' ORDER BY s.title,s.id")).rows as Source[];
  const candidates=(await pool.query('SELECT id,transcription,rating,revision FROM review_candidates')).rows as Candidate[];
  const links=(await pool.query('SELECT source_id,candidate_id,feedback_hash FROM review_candidate_sources')).rows;
  const skipped:Record<string,number>={},records=[];
  for(const source of sources){
   const parsed=eligible(source);
   if('reason' in parsed){skipped[parsed.reason]=(skipped[parsed.reason]||0)+1;continue;}
   const existing=links.filter(l=>l.source_id===source.id),hash=feedbackHash(parsed.review.text,parsed.review.rating);
   const matchingLinks=links.filter(l=>l.feedback_hash===hash).map(l=>l.candidate_id);
   records.push({source_id:source.id,title:source.title,provider:source.provider,source_hash:source.source_hash,review:parsed.review,
    existing_candidate_ids:[...new Set([...candidateMatches(candidates,parsed.review),...matchingLinks,...existing.map(l=>l.candidate_id)])],
    imported_candidate_id:existing[0]?.candidate_id||null});
  }
  return {records,skipped,totals:{source_records:sources.length,eligible:records.length}};
 });
 app.post('/review-candidates/import-source-feedback',async req=>{
  const a=await owner(req),input=z.object({source_ids:z.array(z.string().uuid()).min(1).max(100).refine(v=>new Set(v).size===v.length,'Select each source once.'),confirmed:z.literal(true)}).strict().parse(req.body);
  return transaction(async db=>{
   const sources=(await db.query(sourceQuery+' WHERE s.id=ANY($1::uuid[]) ORDER BY s.id FOR UPDATE OF s',[input.source_ids])).rows as Source[];
   if(sources.length!==input.source_ids.length)fail(404,'Some selected source records are unavailable.');
   // Validate the full batch before recording any decision.
   const verified=sources.map(source=>{const parsed=eligible(source);if('reason' in parsed)fail(409,'A selected source has no eligible verified completed-order review ('+parsed.reason+').');return {source,review:parsed.review};});
   // Deterministic locking order prevents duplicate concurrent imports and deadlocks.
   const fingerprints=[...new Set(verified.map(v=>feedbackHash(v.review.text,v.review.rating)))].sort();
   for(const hash of fingerprints)await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['review-feedback:'+hash]);
   let added=0,linked_existing=0,unchanged=0;const records=[];
   for(const {source,review}of verified){
    const hash=feedbackHash(review.text,review.rating),prior=(await db.query('SELECT candidate_id,feedback_hash FROM review_candidate_sources WHERE source_id=$1 ORDER BY created_at,id',[source.id])).rows;
    const same=prior.find(r=>r.feedback_hash===hash);
    if(same){unchanged++;records.push({source_id:source.id,candidate_id:same.candidate_id,result:'unchanged'});continue;}
    const candidates=(await db.query('SELECT id,transcription,rating,revision FROM review_candidates')).rows as Candidate[];
    const linked=(await db.query('SELECT DISTINCT candidate_id FROM review_candidate_sources WHERE feedback_hash=$1',[hash])).rows.map(r=>r.candidate_id as string);
    const matches=[...new Set(prior.length?prior.map(r=>r.candidate_id):[...candidateMatches(candidates,review),...linked])];
    if(matches.length>1)fail(409,'This exact review body and rating match multiple candidates. Resolve the duplicate identities before importing this source.');
    let candidateId=matches[0];let result='linked_existing';
    if(!candidateId){
     candidateId='feedback-'+hash;
     const row=(await db.query(`INSERT INTO review_candidates(id,source_kind,source_number,original_text,transcription,rating,platform,platform_verified,review_date,text_truncated)
      VALUES($1,'portfolio_feedback',NULL,$2,$2,$3,'Fiverr',true,$4,$5) RETURNING *`,[candidateId,review.text,review.rating,review.reviewed_at||'',review.text_scope!=='complete_visible_customer_review_block'])).rows[0] as Candidate;
     await recordReviewVersion(db,row,'source_feedback_imported',a);added++;result='added';
    }else linked_existing++;
    const snapshot={provider:source.provider,source_title:source.title,captured_review:review,
     link_basis:result==='added'?'Private source-feedback draft':'Review-text/rating equivalence or an earlier explicit source link; no automatic identity or project attribution.',
     source_verification:{status:source.facts.status,detail_inspected:source.facts.detail_inspected,activity_inspected:source.facts.activity_inspected,review_checked:source.facts.review_checked,inspected_at:typeof source.facts.inspected_at==='string'?source.facts.inspected_at:null},
     publication_rights:'UNCLEARED',identity_publication:'Owner confirmation required; source display information is not automatically public authorship.'};
    await db.query('INSERT INTO review_candidate_sources(candidate_id,source_id,source_history_id,source_hash,feedback_hash,feedback_snapshot,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[candidateId,source.id,source.history_id,source.source_hash,hash,JSON.stringify(snapshot),a.id]);
    records.push({source_id:source.id,candidate_id:candidateId,result});
   }
   await db.query('INSERT INTO audit_log(org_id,actor_id,action,resource,detail) VALUES($1,$2,$3,$4,$5)',[a.org_id||null,a.id,'review.source_feedback_imported','review-candidates',JSON.stringify({added,linked_existing,unchanged,source_ids:input.source_ids})]);
   return {added,linked_existing,unchanged,records,message:`${added} private draft candidates added; ${linked_existing} sources linked to existing reviews; ${unchanged} unchanged. No review was approved or published.`};
  });
 });
 app.get('/review-candidates/:id/source-evidence',async(req,reply)=>{
  await owner(req);const id=z.string().max(100).parse((req.params as {id:string}).id);
  const candidate=(await pool.query('SELECT id,source_kind FROM review_candidates WHERE id=$1',[id])).rows[0];
  if(!candidate)fail(404,'Review candidate not found.');
  const sources=(await pool.query(`SELECT l.source_id,s.title,s.provider,l.source_hash,l.feedback_hash,l.feedback_snapshot,l.created_at
   FROM review_candidate_sources l JOIN portfolio_sources s ON s.id=l.source_id WHERE l.candidate_id=$1 ORDER BY l.created_at,l.id`,[id])).rows;
  reply.header('Cache-Control','private, no-store');
  return {candidate_id:id,source_kind:candidate.source_kind,evidence:sources.map(s=>({source_id:s.source_id,title:s.title,provider:s.provider,source_hash:s.source_hash,feedback_hash:s.feedback_hash,captured_review:s.feedback_snapshot.captured_review,source_verification:s.feedback_snapshot.source_verification,link_basis:s.feedback_snapshot.link_basis,publication_rights:s.feedback_snapshot.publication_rights,recorded_at:s.created_at}))};
 });
 app.get('/review-candidates/:id/history',async(req,reply)=>{
  await owner(req);const id=z.string().max(100).parse((req.params as {id:string}).id);
  if(!(await pool.query('SELECT 1 FROM review_candidates WHERE id=$1',[id])).rowCount)fail(404,'Review candidate not found.');
  reply.header('Cache-Control','private, no-store');
  return (await pool.query('SELECT id,event,revision,snapshot,created_at FROM review_candidate_versions WHERE candidate_id=$1 ORDER BY id DESC',[id])).rows;
 });
}
