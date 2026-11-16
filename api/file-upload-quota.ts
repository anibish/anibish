import {createHash} from 'node:crypto';
import {mkdir,open,statfs,unlink} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import type {PoolClient} from 'pg';
import {pool} from './db';
import {fail} from './security';

const MiB=1024*1024,GiB=1024*MiB;
export const FILE_UPLOAD_QUOTA_LOCK=871491;
let activeUploads=0;
/** Only these bounded, non-sensitive operational messages may reach clients for 5xx errors. */
export class SafeUploadError extends Error{constructor(readonly statusCode:503|507,message:string){super(message);this.name='SafeUploadError';}}
function unavailable(status:503|507,message:string):never{throw new SafeUploadError(status,message);}
function limit(name:string,fallback:number,max=Number.MAX_SAFE_INTEGER){
 const raw=process.env[name];if(raw===undefined||raw==='')return fallback;
 if(!/^\d+$/.test(raw))unavailable(503,'File upload limits require administrator attention. No file was saved.');
 const value=Number(raw);if(!Number.isSafeInteger(value)||value<1||value>max)unavailable(503,'File upload limits require administrator attention. No file was saved.');return value;
}
export function fileUploadLimits(){return {
 userBytes:limit('ANIBISH_UPLOAD_USER_BYTES',250*MiB),orgBytes:limit('ANIBISH_UPLOAD_ORG_BYTES',GiB),appBytes:limit('ANIBISH_UPLOAD_APP_BYTES',5*GiB),
 userCount:limit('ANIBISH_UPLOAD_USER_COUNT',200),orgCount:limit('ANIBISH_UPLOAD_ORG_COUNT',1000),appCount:limit('ANIBISH_UPLOAD_APP_COUNT',10000),
 minFreeBytes:limit('ANIBISH_UPLOAD_MIN_FREE_BYTES',5*GiB),concurrency:limit('ANIBISH_UPLOAD_CONCURRENCY',2,2),
};}
export function fileUploadAdmissionState(){return {active:activeUploads,limit:fileUploadLimits().concurrency};}
export async function withFileUploadAdmission<T>(work:()=>Promise<T>):Promise<T>{
 const max=fileUploadLimits().concurrency;
 if(activeUploads>=max)fail(429,'File uploads are already at capacity. No file was saved. Wait for an upload to finish, then retry.');
 activeUploads++;
 try{return await work();}finally{activeUploads--;}
}
export function validateUploadBytes(bytes:Buffer,truncated:boolean){
 if(truncated||bytes.length>10*MiB)fail(413,'The file exceeds the 10 MB upload limit. No partial file was saved.');
 if(!bytes.length)fail(400,'The selected file is empty. No file was saved.');
}
type Upload={id:string;userId:string;orgId:string;root:string;key:string;data:Buffer};
async function checkQuota(db:PoolClient,input:Upload){
 const policy=fileUploadLimits();
 const usage=(await db.query(`SELECT
  COALESCE(sum(size),0)::text AS app_bytes,count(*)::text AS app_count,
  COALESCE(sum(size) FILTER(WHERE user_id=$1),0)::text AS user_bytes,count(*) FILTER(WHERE user_id=$1)::text AS user_count,
  COALESCE(sum(size) FILTER(WHERE org_id=$2),0)::text AS org_bytes,count(*) FILTER(WHERE org_id=$2)::text AS org_count
  FROM files`,[input.userId,input.orgId])).rows[0];
 const fits=(prefix:'user'|'org'|'app',bytes:number,count:number)=>BigInt(usage[prefix+'_bytes'])+BigInt(input.data.length)<=BigInt(bytes)&&BigInt(usage[prefix+'_count'])+BigInt(1)<=BigInt(count);
 if(!fits('user',policy.userBytes,policy.userCount))fail(413,'Your account file-storage allowance has been reached. No file was saved. Contact the studio for a capacity review.');
 if(!fits('org',policy.orgBytes,policy.orgCount))fail(413,'Your workspace file-storage allowance has been reached. No file was saved. Contact the studio for a capacity review.');
 if(!fits('app',policy.appBytes,policy.appCount))unavailable(507,'File storage is at capacity. No file was saved. Contact the studio or retry after capacity is reviewed.');
 const disk=await statfs(input.root,{bigint:true});
 const required=((BigInt(input.data.length)+disk.bsize-BigInt(1))/disk.bsize+BigInt(2))*disk.bsize+BigInt(policy.minFreeBytes);
 if(disk.bavail*disk.bsize<required)unavailable(507,'File storage has insufficient safe disk headroom. No file was saved. Contact the studio before retrying.');
}
async function committedFile(input:Upload){
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock($1)',[FILE_UPLOAD_QUOTA_LOCK]);
  const row=(await db.query('SELECT user_id,org_id,size,storage_key,sha256 FROM files WHERE id=$1',[input.id])).rows[0];await db.query('COMMIT');
  if(!row)return 'absent';
  const hash=createHash('sha256').update(input.data).digest('hex');
  return row.user_id===input.userId&&row.org_id===input.orgId&&Number(row.size)===input.data.length&&row.storage_key===input.key&&row.sha256===hash?'confirmed':'unexpected';
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
/** The global database lock serializes quota accounting and the matching file/row commit. */
export async function persistFileWithinQuota<T>(input:Upload,save:(db:PoolClient)=>Promise<T>):Promise<T>{
 validateUploadBytes(input.data,false);
 if(basename(input.key)!==input.key||input.key!==input.id+'.bin'||!/^[-a-f0-9]{36}\.bin$/i.test(input.key))fail(500,'Invalid internal file-storage reference.');
 await mkdir(input.root,{recursive:true,mode:0o700});
 const path=resolve(input.root,input.key),db=await pool.connect();
 let created=false,committing=false,result:T|undefined,saveFinished=false,rollbackConfirmed=false,released=false,destroyConnection=false;
 const release=()=>{if(!released){released=true;db.release(destroyConnection);}};
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock($1)',[FILE_UPLOAD_QUOTA_LOCK]);await checkQuota(db,input);
  const file=await open(path,'wx',0o600);created=true;
  try{await file.writeFile(input.data);await file.sync();}finally{await file.close();}
  result=await save(db);saveFinished=true;committing=true;await db.query('COMMIT');return result;
 }catch(error){
  try{await db.query('ROLLBACK');rollbackConfirmed=true;}catch{destroyConnection=true;}
  if(created){
   // An unacknowledged COMMIT must never delete a file whose row may have persisted.
   if(!committing&&rollbackConfirmed)await unlink(path).catch(()=>{});
   else{
    release();
    let state:'absent'|'confirmed'|'unexpected'|'unknown'='unknown';try{state=await committedFile(input);}catch{}
    if(state==='confirmed'&&committing&&saveFinished)return result as T;
    if(state==='absent')await unlink(path).catch(()=>{});
    else unavailable(503,'The file-save result could not be confirmed. Its bytes were preserved privately. Refresh your files before retrying or contact the studio.');
    throw error;
   }
  }
  throw error;
 }finally{release();}
}
