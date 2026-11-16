import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pool} from './db';
import {enqueueFileScan,fileSecurityStatus,requireCleanFile,runFileScanBatch,scanWithClamd} from './file-security';

export async function verifyApprovedPublicMedia(){
 const probe=await scanWithClamd(Buffer.from('ANIBISH private scanner readiness probe. No customer data.'));
 if(probe.status!=='clean'||!probe.version?.startsWith('ClamAV 1.5.4/'))throw Error('SCANNER_READINESS_OR_PINNED_VERSION_NOT_VERIFIED');
 const files=(await pool.query('SELECT id,name,mime,storage_key FROM files WHERE public_approved=true AND internal=false ORDER BY created_at')).rows;
 const scanIds:string[]=[];
 for(const file of files){const bytes=await readFile(resolve(process.env.STORAGE_DIR||'storage',file.storage_key));const scan=await enqueueFileScan('file',file.id,bytes,file.name,file.mime);scanIds.push(scan.id);try{await requireCleanFile('file',file.id,bytes,file.name,file.mime);}catch(error){if((error as {statusCode?:number}).statusCode!==409)throw error;}}
 const timeout=Math.min(300000,Math.max(30000,Number(process.env.FILE_SECURITY_PREFLIGHT_TIMEOUT_MS)||180000)),deadline=Date.now()+timeout;
 while(files.length&&Date.now()<deadline){
  await runFileScanBatch(scanWithClamd,scanIds);
  const states=await Promise.all(files.map(file=>fileSecurityStatus('file',file.id)));
  if(states.some(row=>['infected','blocked'].includes(row.status)))throw Error('APPROVED_MEDIA_QUARANTINED_OWNER_REVIEW_REQUIRED');
  if(states.every(row=>row.downloadable))return {approved_public_media:files.length,all_clean:true};
  await new Promise(r=>setTimeout(r,2000));
 }
 if(files.length)throw Error('APPROVED_MEDIA_SCAN_NOT_VERIFIED_BEFORE_TIMEOUT');
 return {approved_public_media:0,all_clean:true};
}
if(process.argv[1]?.endsWith('file-security-preflight.ts'))verifyApprovedPublicMedia().then(result=>{console.log(JSON.stringify(result));return pool.end()}).catch(()=>{console.error('Attachment preflight blocked. Inspect private scan status; no unverified public media was released.');process.exitCode=1;return pool.end()});
