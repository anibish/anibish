import {createHash} from 'node:crypto';
import {createConnection} from 'node:net';
import {readFile,stat} from 'node:fs/promises';
import {basename,resolve,sep} from 'node:path';
import type {PoolClient} from 'pg';
import {pool,transaction} from './db';
import {fail} from './security';

export type FileSource='file'|'mail_attachment'|'composition';
type Query=Pick<PoolClient,'query'>;
export type ScanResult={status:'clean'|'infected'|'blocked'|'error';reason:string;version?:string;signatureAt?:Date};
export type FileScanner=(content:Buffer)=>Promise<ScanResult>;
const MAX_FILE_BYTES=10*1024*1024;
const MAX_SCAN_BYTES=12*1024*1024;
const sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const signatureMaxAge=()=>Math.min(168,Math.max(24,Number(process.env.CLAMAV_MAX_SIGNATURE_AGE_HOURS)||72))*3600000;
export function safeFileName(name:string){
 const clean=basename(name.replace(/\\/g,'/')).normalize('NFKC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069";:]/g,'_').replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,180);
 return clean||'attachment';
}
export function fileTypeEvidence(data:Buffer,name:string,declaredMime:string,maxBytes=MAX_FILE_BYTES){
 let detected='application/octet-stream';
 if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))detected='image/png';
 else if(data.subarray(0,3).equals(Buffer.from([255,216,255])))detected='image/jpeg';
 else if(data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP')detected='image/webp';
 else if(data.subarray(0,5).toString()==='%PDF-')detected='application/pdf';
 else if(['504b0304','504b0506','504b0708'].includes(data.subarray(0,4).toString('hex')))detected='application/zip';
 else if(data.subarray(0,2).toString('hex')==='1f8b')detected='application/gzip';
 else if(data.subarray(0,6).toString('hex')==='377abcaf271c')detected='application/x-7z-compressed';
 else if(data.subarray(0,4).toString()==='Rar!')detected='application/vnd.rar';
 else if(data.subarray(0,2).toString()==='MZ'||data.subarray(0,4).toString('hex')==='7f454c46')detected='application/x-executable';
 else if(!data.includes(0)&&!data.toString('utf8').includes('\ufffd'))detected='text/plain';
 const mime=declaredMime.toLowerCase().split(';')[0].trim(),safeName=safeFileName(name);
 let reason='';
 if(!data.length)reason='EMPTY_FILE';
 else if(data.length>maxBytes)reason='FILE_SIZE_LIMIT';
 else if(detected==='application/x-executable'||/\.(?:exe|com|scr|dll|msi|bat|cmd|ps1|vbs|hta|lnk|app|dmg)$/i.test(safeName))reason='EXECUTABLE_ATTACHMENT';
 else if(detected==='application/octet-stream')reason='UNRECOGNIZED_BINARY';
 else if(mime.startsWith('image/')&&mime!==detected||mime==='application/pdf'&&detected!==mime||['application/zip','application/x-zip-compressed'].includes(mime)&&detected!=='application/zip'||mime.startsWith('text/')&&detected!=='text/plain')reason='MIME_MAGIC_MISMATCH';
 return {safeName,detected,validation:reason?'blocked':'valid',reason} as const;
}
export async function enqueueFileScan(kind:FileSource,id:string,data:Buffer,name:string,mime:string,db:Query=pool){
 const hash=sha(data),type=fileTypeEvidence(data,name,mime,kind==='mail_attachment'?MAX_SCAN_BYTES:kind==='composition'?600000:MAX_FILE_BYTES);
 const [row]=(await db.query(`INSERT INTO file_scan_records(source_kind,source_id,sha256,size,safe_name,declared_mime,detected_mime,validation,status,reason,composition_content)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(source_kind,source_id,sha256) DO NOTHING RETURNING *`,[kind,id,hash,data.length,type.safeName,mime.slice(0,200),type.detected,type.validation,type.validation==='valid'?'pending':'blocked',type.reason,kind==='composition'?data:null])).rows;
 if(row){await db.query('INSERT INTO file_scan_events(scan_id,event,detail) VALUES($1,$2,$3)',[row.id,'registered',JSON.stringify({status:row.status,reason:row.reason,sha256:hash,size:data.length})]);return row;}
 return (await db.query('SELECT * FROM file_scan_records WHERE source_kind=$1 AND source_id=$2 AND sha256=$3',[kind,id,hash])).rows[0];
}
function fresh(row:{signature_at?:Date|string|null}){const at=row.signature_at?new Date(row.signature_at).getTime():0;return at<=Date.now()+300000&&at>Date.now()-signatureMaxAge();}
function verifiedProof(row:{validation?:string;reason?:string;signature_version?:string|null;signature_at?:Date|string|null;scanned_at?:Date|string|null}){return row.validation==='valid'&&row.reason===''&&Boolean(row.signature_version&&row.scanned_at)&&fresh(row);}
export async function requireCleanFile(kind:FileSource,id:string,data:Buffer,name:string,mime:string){
 const currentType=fileTypeEvidence(data,name,mime,kind==='mail_attachment'?MAX_SCAN_BYTES:kind==='composition'?600000:MAX_FILE_BYTES);
 const row=await enqueueFileScan(kind,id,data,name,mime);
 if(currentType.validation==='blocked')fail(423,'This file is quarantined ('+currentType.reason+'). The original is preserved privately.');
 if(['clean','scanning'].includes(row.status)&&verifiedProof(row))return row;
 if(row.status==='clean')await pool.query("UPDATE file_scan_records SET status='pending',reason='SIGNATURES_STALE',available_at=now(),updated_at=now() WHERE id=$1 AND status='clean'",[row.id]);
 if(['infected','blocked'].includes(row.status))fail(423,'This file is quarantined ('+row.reason+'). The original is preserved privately. Contact the studio for review; it has not been released.');
 fail(409,'This file is awaiting a verified malware scan. The original is preserved privately. Retry after scanning; downloads remain blocked while the scanner is unavailable or signatures are stale.');
}
export async function requireCleanComposition(attachments:{name:string;base64:string}[]=[]){
 for(const attachment of attachments){const data=Buffer.from(attachment.base64,'base64');await requireCleanFile('composition',sha(Buffer.concat([Buffer.from(attachment.name+'\0'),data])),data,attachment.name,'application/octet-stream');}
}
function clamdCommand(command:string,data?:Buffer){
 return new Promise<string>((resolveReply,reject)=>{
  const host=process.env.CLAMAV_HOST;if(!host){reject(Object.assign(Error('SCANNER_UNAVAILABLE'),{code:'SCANNER_UNAVAILABLE'}));return;}
  const socket=createConnection({host,port:Number(process.env.CLAMAV_PORT)||3310});let response=Buffer.alloc(0),done=false;
  const finish=(error?:Error)=>{if(done)return;done=true;socket.destroy();if(error)reject(error);else resolveReply(response.toString('utf8').replace(/\0/g,'').trim());};
  const timeout=setTimeout(()=>finish(Object.assign(Error('SCANNER_TIMEOUT'),{code:'SCANNER_TIMEOUT'})),Math.min(60000,Math.max(1000,Number(process.env.CLAMAV_TIMEOUT_MS)||30000)));timeout.unref();
  socket.on('error',()=>finish(Object.assign(Error('SCANNER_UNAVAILABLE'),{code:'SCANNER_UNAVAILABLE'})));
  socket.on('data',chunk=>{response=Buffer.concat([response,chunk]);if(response.length>8192)finish(Error('SCANNER_RESPONSE_LIMIT'));else if(response.includes(0))finish();});
  socket.on('end',()=>finish(response.length?undefined:Error('SCANNER_EMPTY_RESPONSE')));
  socket.on('close',()=>clearTimeout(timeout));
  socket.on('connect',()=>{void(async()=>{socket.write('z'+command+'\0');if(data){for(let i=0;i<data.length;i+=65536){const chunk=data.subarray(i,i+65536),header=Buffer.alloc(4);header.writeUInt32BE(chunk.length);if(!socket.write(Buffer.concat([header,chunk])))await new Promise<void>((r,j)=>{socket.once('drain',r);socket.once('error',j);socket.once('close',r);});if(done)return;}socket.write(Buffer.alloc(4));}})().catch(()=>finish(Error('SCANNER_STREAM_FAILED')));});
 });
}
export const scanWithClamd:FileScanner=async data=>{
 if(data.length>MAX_SCAN_BYTES)return {status:'blocked',reason:'SCAN_SIZE_LIMIT'};
 if(process.env.CLAMAV_POLICY_CONFIRMED!=='true')return {status:'error',reason:'SCANNER_POLICY_NOT_VERIFIED'};
 try{
  const version=await clamdCommand('VERSION'),match=version.match(/^ClamAV\s+[\w.-]+\/\d+\/(.+)$/),signatureAt=match?new Date(match[1]):null;
  if(!signatureAt||!Number.isFinite(signatureAt.getTime())||!fresh({signature_at:signatureAt}))return {status:'error',reason:'SCANNER_SIGNATURES_STALE'};
  const response=await clamdCommand('INSTREAM',data);
  if(response==='stream: OK')return {status:'clean',reason:'',version:version.slice(0,200),signatureAt};
  if(/FOUND$/.test(response))return {status:/Heuristics\.(?:Limits|Encrypted)|ExceedsMax|Encrypted/i.test(response)?'blocked':'infected',reason:/Heuristics\.(?:Limits|Encrypted)|ExceedsMax|Encrypted/i.test(response)?'SCAN_INCOMPLETE_OR_ENCRYPTED':'MALWARE_DETECTED',version:version.slice(0,200),signatureAt};
  return {status:'error',reason:/limit|size/i.test(response)?'SCANNER_LIMIT_EXCEEDED':'SCANNER_INCOMPLETE',version:version.slice(0,200),signatureAt};
 }catch(error){return {status:'error',reason:['SCANNER_TIMEOUT','SCANNER_UNAVAILABLE'].includes(String((error as {code?:string}).code))?String((error as {code:string}).code):'SCANNER_PROTOCOL_ERROR'};}
};
async function sourceBytes(record:{source_kind:FileSource;source_id:string;composition_content:Buffer|null}){
 if(record.source_kind==='composition')return record.composition_content;
 if(record.source_kind==='mail_attachment')return (await pool.query('SELECT content FROM mail_attachments WHERE id=$1',[record.source_id])).rows[0]?.content as Buffer|undefined;
 const file=(await pool.query('SELECT storage_key FROM files WHERE id=$1',[record.source_id])).rows[0];if(!file)return;
 const root=resolve(process.env.STORAGE_DIR||'storage'),path=resolve(root,file.storage_key);if(!path.startsWith(root+sep))throw Error('UNSAFE_STORAGE_REFERENCE');
 if((await stat(path)).size>MAX_SCAN_BYTES)throw Error('SCAN_SIZE_LIMIT');
 return readFile(path);
}
export async function backfillFileScans(){
 const files=(await pool.query("SELECT f.id,f.storage_key,f.name,f.mime FROM files f WHERE NOT EXISTS(SELECT 1 FROM file_scan_records s WHERE s.source_kind='file' AND s.source_id=f.id::text) ORDER BY f.created_at LIMIT 5")).rows;
 for(const file of files){try{const bytes=await sourceBytes({source_kind:'file',source_id:file.id,composition_content:null});if(bytes)await enqueueFileScan('file',file.id,bytes,file.name,file.mime);}catch{await pool.query("INSERT INTO audit_log(action,resource,detail) VALUES('file.scan_source_unavailable',$1,'{}')",[file.id]);}}
 const mail=(await pool.query("SELECT a.id,a.name,a.mime,a.content FROM mail_attachments a WHERE NOT EXISTS(SELECT 1 FROM file_scan_records s WHERE s.source_kind='mail_attachment' AND s.source_id=a.id::text) LIMIT 5")).rows;
 for(const a of mail)await enqueueFileScan('mail_attachment',a.id,a.content,a.name,a.mime);
}
export async function runFileScanBatch(scanner:FileScanner=scanWithClamd,onlyIds?:string[]){
 if(!onlyIds)await backfillFileScans();let processed=0;
 for(let n=0;n<2;n++){
  const record=await transaction(async db=>{const [r]=(await db.query("SELECT * FROM file_scan_records WHERE (status IN('pending','error') AND available_at<=now() OR status='scanning' AND locked_at<now()-interval '5 minutes' OR status='clean' AND scanned_at<now()-interval '24 hours') AND validation='valid' AND ($1::uuid[] IS NULL OR id=ANY($1::uuid[])) ORDER BY CASE WHEN status='clean' THEN 1 ELSE 0 END,created_at FOR UPDATE SKIP LOCKED LIMIT 1",[onlyIds||null])).rows;if(!r)return null;await db.query("UPDATE file_scan_records SET status='scanning',locked_at=now(),attempts=attempts+1,updated_at=now() WHERE id=$1",[r.id]);return r;});
  if(!record)break;
  let result:ScanResult;
  try{const bytes=await sourceBytes(record);result=!bytes?{status:'error',reason:'SOURCE_UNAVAILABLE'}:sha(bytes)!==record.sha256?{status:'blocked',reason:'SOURCE_HASH_CHANGED'}:await scanner(bytes);if(result.status==='clean'&&(!result.version||!fresh({signature_at:result.signatureAt})))result={status:'error',reason:'SCANNER_EVIDENCE_INCOMPLETE'};}catch{result={status:'error',reason:'SOURCE_UNAVAILABLE'};}
  await transaction(async db=>{await db.query("UPDATE file_scan_records SET status=$2,reason=$3,signature_version=$4,signature_at=$5,scanned_at=now(),locked_at=NULL,available_at=now()+($6*interval '1 second'),updated_at=now() WHERE id=$1",[record.id,result.status,result.reason,result.version||null,result.signatureAt||null,Math.min(3600,30*2**Math.min(7,record.attempts))]);await db.query('INSERT INTO file_scan_events(scan_id,event,detail) VALUES($1,$2,$3)',[record.id,'scan_completed',JSON.stringify({status:result.status,reason:result.reason,signature_version:result.version||null,signature_at:result.signatureAt||null})]);await db.query("INSERT INTO audit_log(action,resource,detail) VALUES('file.scan_completed',$1,$2)",[record.id,JSON.stringify({status:result.status,reason:result.reason})]);});processed++;
 }
 return {processed};
}
export async function fileSecurityStatus(kind:FileSource,id:string){
 const [row]=(await pool.query('SELECT id,status,reason,sha256,size,detected_mime,validation,signature_version,signature_at,scanned_at,updated_at FROM file_scan_records WHERE source_kind=$1 AND source_id=$2 ORDER BY created_at DESC LIMIT 1',[kind,id])).rows;
 return row?{...row,downloadable:['clean','scanning'].includes(row.status)&&verifiedProof(row)}:{status:'pending',reason:'AWAITING_SCAN_REGISTRATION',downloadable:false};
}
