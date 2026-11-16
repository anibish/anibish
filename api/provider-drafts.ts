import {requireCleanComposition} from './file-security';
import {createHash} from 'node:crypto';
import nodemailer from 'nodemailer';
import type {ImapFlow} from 'imapflow';
import type {PoolClient} from 'pg';
import type {Actor} from './context';
import {pool,transaction} from './db';
import {fail} from './security';

export type ProviderDraftTransport=<T>(account:string,action:(client:ImapFlow)=>Promise<T>)=>Promise<T>;
type Job={id:string;draft_id:string;draft_revision:number;mailbox:string;message_id:string;content_hash:string;raw_sha256:string;raw_message:Buffer;status:string;append_attempted_at:Date|null;provider_folder:string|null;provider_uidvalidity:string|null;provider_uid:string|null;cleanup_status:string;cleanup_attempted_at:Date|null;attempts:number;actor_id:string;[key:string]:unknown};
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
function fault(code:string):never{throw Object.assign(new Error(code),{code});}
const publicColumns='id,draft_id,draft_revision,mailbox,message_id,status,provider_folder,provider_uidvalidity,provider_uid,cleanup_status,cleanup_folder,cleanup_uidvalidity,cleanup_uid,last_error,attempts,created_at,updated_at';
async function event(db:Pick<PoolClient,'query'>,id:string,name:string,detail:unknown={}){await db.query('INSERT INTO mail_draft_sync_events(job_id,event,detail) VALUES($1,$2,$3)',[id,name,JSON.stringify(detail)]);}
function stateMessage(job:{status:string;cleanup_status?:string}){
 if(job.status==='confirmed'&&['pending','processing'].includes(job.cleanup_status||''))return 'The new provider copy is verified. Older-copy cleanup is awaiting verification; no email was sent.';
 if(job.status==='confirmed')return job.cleanup_status==='retained'||job.cleanup_status==='uncertain'?'The saved provider copy is verified. An older provider copy is retained; review cleanup before removing anything.':'The saved provider draft is verified. No email was sent.';
 if(job.status==='uncertain')return 'The provider result is uncertain. Reconcile this saved revision before trying another copy. No automatic APPEND retry will occur.';
 if(job.status==='failed')return 'Provider draft synchronization needs attention. The private saved draft is unchanged; review the diagnostic and retry safely.';
 if(job.status==='superseded')return 'A newer private revision exists. This older queued revision was not copied.';
 return 'The saved revision is queued for provider verification. No email was sent.';
}
export async function getProviderDraftState(draftId:string){
 const draft=(await pool.query('SELECT id,revision FROM mail_drafts WHERE id=$1',[draftId])).rows[0];if(!draft)fail(404,'Saved draft not found.');
 const jobs=(await pool.query(`SELECT ${publicColumns} FROM mail_draft_sync_jobs WHERE draft_id=$1 ORDER BY draft_revision DESC`,[draftId])).rows;
 const job=jobs.find(j=>j.draft_revision===draft.revision)||null;
 return {draft_id:draftId,revision:draft.revision,message:job?stateMessage(job):'This saved revision has no provider sync job.',uncertain:job?.status==='uncertain',job:job?{...job,message:stateMessage(job)}:null,previous:jobs.filter(j=>j!==job).slice(0,10).map(j=>({...j,message:stateMessage(j)}))};
}
export async function enqueueProviderDraft(draftId:string,expectedRevision:number,actor:Actor){
 await transaction(async db=>{
  const draft=(await db.query('SELECT * FROM mail_drafts WHERE id=$1 FOR UPDATE',[draftId])).rows[0];if(!draft)fail(404,'Saved draft not found.');
  if(draft.revision!==expectedRevision)fail(409,'This saved draft changed. Refresh and reopen it before synchronizing; your editor text is preserved.');
  if(draft.extras?.archived)fail(409,'Restore the private draft before synchronizing it.');
  if((await db.query('SELECT 1 FROM mail_draft_sync_jobs WHERE draft_id=$1 AND draft_revision=$2',[draftId,expectedRevision])).rowCount)return;
  if((await db.query("SELECT 1 FROM mail_draft_sync_jobs WHERE draft_id=$1 AND status IN('uncertain','processing','reconcile_pending') LIMIT 1",[draftId])).rowCount)fail(409,'An earlier provider result needs reconciliation before a newer copy can be created.');
  if(/[\r\n]/.test(draft.recipient+draft.subject))fail(400,'Remove line breaks from the recipient and subject before provider sync. The private draft is unchanged.');
  const source={mailbox:draft.mailbox,recipient:draft.recipient,subject:draft.subject,body:draft.body,extras:{cc:draft.extras?.cc||[],attachments:draft.extras?.attachments||[]}};
  await requireCleanComposition(source.extras.attachments);
  const hash=sha(JSON.stringify(source)),messageId=`<draft-${draftId}-r${expectedRevision}@anibish.com>`;
  const composer=nodemailer.createTransport({streamTransport:true,buffer:true});
  const compiled=await composer.sendMail({from:{name:'Anibish',address:draft.mailbox+'@anibish.com'},to:draft.recipient||undefined,cc:source.extras.cc,subject:draft.subject,text:draft.body,messageId,date:new Date(draft.updated_at),headers:{'X-Anibish-Draft-ID':draftId,'X-Anibish-Draft-Revision':String(expectedRevision),'X-Anibish-Draft-Content-Hash':hash},attachments:source.extras.attachments.map((f:{name:string;base64:string})=>({filename:f.name,content:Buffer.from(f.base64,'base64')}))});
  const raw=Buffer.isBuffer(compiled.message)?compiled.message:fault('MIME_PREPARATION_FAILED');
  if(raw.length>1024*1024)fail(400,'The compiled draft exceeds the 1 MB provider-sync limit. Reduce the attachments and save again.');
  const job=(await db.query(`INSERT INTO mail_draft_sync_jobs(draft_id,draft_revision,mailbox,source_snapshot,message_id,content_hash,raw_sha256,raw_message,actor_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[draftId,expectedRevision,draft.mailbox,JSON.stringify(source),messageId,hash,sha(raw),raw,actor.id])).rows[0];
  await db.query("UPDATE mail_draft_sync_jobs SET status='superseded',updated_at=now() WHERE draft_id=$1 AND draft_revision<$2 AND status IN('pending','failed') AND append_attempted_at IS NULL",[draftId,expectedRevision]);
  await event(db,job.id,'queued',{revision:expectedRevision});
  await db.query('INSERT INTO audit_log(org_id,actor_id,action,resource,detail) VALUES($1,$2,$3,$4,$5)',[actor.org_id||null,actor.id,'email.provider_draft_queued',draftId,JSON.stringify({revision:expectedRevision,job_id:job.id})]);
 });
 return getProviderDraftState(draftId);
}
export async function requestProviderDraftReconcile(draftId:string,jobId:string,actor:Actor){
 await transaction(async db=>{
  const row=(await db.query('SELECT * FROM mail_draft_sync_jobs WHERE id=$1 AND draft_id=$2 FOR UPDATE',[jobId,draftId])).rows[0];if(!row)fail(404,'Provider draft job not found.');
  if(row.status==='processing')fail(409,'This provider operation is still processing. Refresh its status before reconciling.');
  await db.query("UPDATE mail_draft_sync_jobs SET status='reconcile_pending',available_at=now(),updated_at=now() WHERE id=$1",[jobId]);
  await event(db,jobId,'reconciliation_requested');await db.query('INSERT INTO audit_log(org_id,actor_id,action,resource) VALUES($1,$2,$3,$4)',[actor.org_id||null,actor.id,'email.provider_draft_reconcile_requested',jobId]);
 });
 return getProviderDraftState(draftId);
}
function header(source:Buffer,name:string){const headers=source.toString('utf8').split(/\r?\n\r?\n/,1)[0].replace(/\r?\n[ \t]+/g,' ');return headers.match(new RegExp('^'+name+':\\s*(.+)$','im'))?.[1].trim();}
async function specialFolder(client:ImapFlow,role:'\\Drafts'|'\\Trash'){
 const folders=(await client.list()).filter(f=>f.specialUse===role&&f.specialUseSource!=='name'&&!f.flags.has('\\Noselect'));
 if(folders.length!==1)fault(role==='\\Drafts'?'DRAFTS_FOLDER_NOT_VERIFIED':'TRASH_FOLDER_NOT_VERIFIED');return folders[0].path;
}
async function verifiedMessage(client:ImapFlow,uid:number,job:Job,requireDraft=true){
 const mail=await client.fetchOne(uid,{uid:true,source:true,envelope:true,flags:true},{uid:true});
 if(!mail||!mail.source)fault('PROVIDER_FETCH_UNCERTAIN');
 if(header(mail.source,'Message-ID')!==job.message_id)return false;
 if(sha(mail.source)!==job.raw_sha256||header(mail.source,'X-Anibish-Draft-ID')!==job.draft_id||header(mail.source,'X-Anibish-Draft-Revision')!==String(job.draft_revision)||header(mail.source,'X-Anibish-Draft-Content-Hash')!==job.content_hash)fault('PROVIDER_COPY_CHANGED');
 if(requireDraft&&!mail.flags?.has('\\Draft'))fault('PROVIDER_DRAFT_FLAG_MISSING');return true;
}
async function findCopy(client:ImapFlow,job:Job,requireDraft=true){
 const result=await client.search({header:{'message-id':job.message_id}},{uid:true,strict:true});
 if(!Array.isArray(result))fault('PROVIDER_SEARCH_UNCERTAIN');
 const exact:number[]=[];for(const uid of result){if(await verifiedMessage(client,uid,job,requireDraft))exact.push(uid);}
 if(exact.length>1)fault('MULTIPLE_PROVIDER_COPIES');return exact[0]||null;
}
function validity(client:ImapFlow){if(!client.mailbox||client.mailbox.uidValidity===undefined)fault('UIDVALIDITY_UNAVAILABLE');return String(client.mailbox.uidValidity);}
async function markConfirmed(db:PoolClient,job:Job,folder:string,uidvalidity:string,uid:number){
 await db.query("UPDATE mail_draft_sync_jobs SET status='confirmed',cleanup_status=CASE WHEN EXISTS(SELECT 1 FROM mail_draft_sync_jobs old WHERE old.draft_id=mail_draft_sync_jobs.draft_id AND old.draft_revision<mail_draft_sync_jobs.draft_revision AND old.status='confirmed' AND old.cleanup_status<>'moved_to_trash') THEN 'pending' ELSE 'not_needed' END,provider_folder=$2,provider_uidvalidity=$3,provider_uid=$4,last_error=NULL,locked_at=NULL,updated_at=now() WHERE id=$1",[job.id,folder,uidvalidity,uid]);
 await event(db,job.id,'provider_copy_verified',{folder,uidvalidity,uid});
}
async function reconcileCleanup(db:PoolClient,job:Job,transport:ProviderDraftTransport){
 const older=(await db.query("SELECT * FROM mail_draft_sync_jobs WHERE draft_id=$1 AND draft_revision<$2 AND status='confirmed' AND cleanup_status<>'moved_to_trash' ORDER BY draft_revision",[job.draft_id,job.draft_revision])).rows as Job[];
 let retained=false,uncertain=false;
 for(const old of older){
  try{await transport(old.mailbox,async client=>{
   if(!client.capabilities.has('MOVE'))fault('NATIVE_MOVE_UNAVAILABLE');
   if(!old.provider_folder||!old.provider_uidvalidity||!old.provider_uid)fault('OLD_COPY_MAPPING_UNAVAILABLE');
   const trash=await specialFolder(client,'\\Trash');
   let inTrash:number|null=null,trashValidity:string|null=null;
   if(old.cleanup_attempted_at){const lock=await client.getMailboxLock(trash,{acquireTimeout:15000});try{trashValidity=validity(client);inTrash=await findCopy(client,old,false);}finally{lock.release();}}
   const lock=await client.getMailboxLock(old.provider_folder,{acquireTimeout:15000});
   try{
    if(validity(client)!==old.provider_uidvalidity)fault('OLD_UIDVALIDITY_CHANGED');
    const found=await findCopy(client,old,false);
    if(!found){if(inTrash){await db.query("UPDATE mail_draft_sync_jobs SET cleanup_status='moved_to_trash',cleanup_folder=$2,cleanup_uidvalidity=$3,cleanup_uid=$4,updated_at=now() WHERE id=$1",[old.id,trash,trashValidity,inTrash]);return;}fault('OLD_COPY_NOT_VERIFIED');}
    if(found!==Number(old.provider_uid)||inTrash)fault('OLD_COPY_LOCATION_AMBIGUOUS');
    await db.query("UPDATE mail_draft_sync_jobs SET cleanup_status='processing',cleanup_attempted_at=now(),updated_at=now() WHERE id=$1",[old.id]);
    // Only native UID MOVE is allowed: ImapFlow's fallback would EXPUNGE.
    await client.messageMove(found,trash,{uid:true});
   }finally{lock.release();}
   const trashLock=await client.getMailboxLock(trash,{acquireTimeout:15000});
   try{trashValidity=validity(client);inTrash=await findCopy(client,old,false);if(!inTrash)fault('TRASH_COPY_UNCONFIRMED');}finally{trashLock.release();}
   const sourceLock=await client.getMailboxLock(old.provider_folder,{acquireTimeout:15000});
   try{if(validity(client)!==old.provider_uidvalidity||await findCopy(client,old,false))fault('MOVE_OUTCOME_UNCONFIRMED');}finally{sourceLock.release();}
   await db.query("UPDATE mail_draft_sync_jobs SET cleanup_status='moved_to_trash',cleanup_folder=$2,cleanup_uidvalidity=$3,cleanup_uid=$4,updated_at=now() WHERE id=$1",[old.id,trash,trashValidity,inTrash]);await event(db,old.id,'older_copy_moved_to_trash',{replacement_job:job.id});
  });}catch(error){
   const code=errorCode(error),attempted=(await db.query('SELECT cleanup_attempted_at FROM mail_draft_sync_jobs WHERE id=$1',[old.id])).rows[0]?.cleanup_attempted_at;
   const state=attempted?'uncertain':'retained';retained=true;uncertain||=Boolean(attempted);
   await db.query('UPDATE mail_draft_sync_jobs SET cleanup_status=$2,last_error=$3,updated_at=now() WHERE id=$1',[old.id,state,code]);await event(db,old.id,'older_copy_retained',{code,replacement_job:job.id});
  }
 }
 await db.query("UPDATE mail_draft_sync_jobs SET cleanup_status=$2,last_error=CASE WHEN $2 IN('retained','uncertain') THEN 'OLDER_COPY_RETAINED' ELSE NULL END,updated_at=now() WHERE id=$1",[job.id,uncertain?'uncertain':retained?'retained':older.length?'complete':'not_needed']);
}
function errorCode(error:unknown){const e=error as {code?:string;authenticationFailed?:boolean};if(e.authenticationFailed)return 'AUTHENTICATION_REJECTED';const code=String(e.code||'PROVIDER_OPERATION_FAILED');return /^[A-Z0-9_]{1,60}$/.test(code)?code:'PROVIDER_OPERATION_FAILED';}
export async function processProviderDraftJobs(transport:ProviderDraftTransport,onlyJobId?:string){
 const candidates=(await pool.query("SELECT id,draft_id FROM mail_draft_sync_jobs WHERE (status IN('pending','reconcile_pending') OR (status='confirmed' AND cleanup_status='pending') OR (status='processing' AND locked_at<now()-interval '10 minutes')) AND available_at<=now() AND ($1::uuid IS NULL OR id=$1) ORDER BY created_at LIMIT 5",[onlyJobId||null])).rows;
 let processed=0;
 for(const candidate of candidates){
  const db=await pool.connect();let locked=false;
  try{
   locked=(await db.query("SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",['provider-draft:'+candidate.draft_id])).rows[0].acquired;if(!locked)continue;
   await db.query('BEGIN');
   const job=(await db.query("SELECT * FROM mail_draft_sync_jobs WHERE id=$1 AND (status IN('pending','reconcile_pending') OR (status='confirmed' AND cleanup_status='pending') OR (status='processing' AND locked_at<now()-interval '10 minutes')) FOR UPDATE",[candidate.id])).rows[0] as Job|undefined;
   if(!job){await db.query('COMMIT');continue;}
   const draft=(await db.query('SELECT revision,extras FROM mail_drafts WHERE id=$1',[job.draft_id])).rows[0];
   if((draft?.revision!==job.draft_revision||draft?.extras?.archived)&&!job.append_attempted_at&&!job.provider_uid){await db.query("UPDATE mail_draft_sync_jobs SET status='superseded',locked_at=NULL,updated_at=now() WHERE id=$1",[job.id]);await db.query('COMMIT');continue;}
   await db.query("UPDATE mail_draft_sync_jobs SET status='processing',locked_at=now(),attempts=attempts+1,updated_at=now() WHERE id=$1",[job.id]);await db.query('COMMIT');processed++;
   try{
    await transport(job.mailbox,async client=>{
     const folder=await specialFolder(client,'\\Drafts'),lock=await client.getMailboxLock(folder,{acquireTimeout:15000});
     try{
      const currentValidity=validity(client);let found=await findCopy(client,job);
      if(!found){
       if(job.append_attempted_at||job.provider_uid)fault('APPEND_OUTCOME_UNCONFIRMED');
       // Commit the attempt marker BEFORE issuing APPEND. After this point, only reconciliation is safe.
       await db.query('UPDATE mail_draft_sync_jobs SET append_attempted_at=now(),provider_folder=$2,provider_uidvalidity=$3,updated_at=now() WHERE id=$1',[job.id,folder,currentValidity]);job.append_attempted_at=new Date();await event(db,job.id,'append_started');
       const result=await client.append(folder,job.raw_message,['\\Draft','\\Seen'],new Date(job.created_at as string));
       if(result&&result.uid&&String(result.uidValidity)===currentValidity&&await verifiedMessage(client,result.uid,job))found=result.uid;
       if(!found)found=await findCopy(client,job);
       if(!found)fault('APPEND_OUTCOME_UNCONFIRMED');
      }
      await markConfirmed(db,job,folder,currentValidity,found);
     }finally{lock.release();}
    });
    // The new copy is already durably confirmed before any old copy is moved.
    await reconcileCleanup(db,job,transport);
   }catch(error){
    const code=errorCode(error),attempted=Boolean(job.append_attempted_at),conflict=['PROVIDER_COPY_CHANGED','MULTIPLE_PROVIDER_COPIES','PROVIDER_FETCH_UNCERTAIN','PROVIDER_SEARCH_UNCERTAIN','PROVIDER_DRAFT_FLAG_MISSING'].includes(code);
    const status=attempted||conflict||Boolean(job.provider_uid)?'uncertain':code==='AUTHENTICATION_REJECTED'||job.attempts>=4?'failed':'pending';
    await db.query('UPDATE mail_draft_sync_jobs SET status=$2,last_error=$3,locked_at=NULL,available_at=now()+interval \'30 seconds\',updated_at=now() WHERE id=$1',[job.id,status,code]);await event(db,job.id,'provider_operation_unconfirmed',{code,status});
   }
  }catch{await db.query('ROLLBACK').catch(()=>{});}
  finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['provider-draft:'+candidate.draft_id]).catch(()=>{});db.release();}
 }
 return {processed};
}
