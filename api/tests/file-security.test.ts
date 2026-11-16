import {freshTotp as totp,fixtureInject} from './auth-factor-fixture';
import {accountTokenFromLink} from './account-link-fixture';
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer,type Server} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';

import {enqueueFileScan,fileSecurityStatus,fileTypeEvidence,requireCleanComposition,runFileScanBatch,safeFileName,scanWithClamd} from '../file-security';
import {syncMailbox} from '../mail-centre';
import type {ImapFlow} from 'imapflow';

let app:Awaited<ReturnType<typeof buildServer>>,clamd:Server;
const suffix=randomUUID().slice(0,8),password='Local-file-security-'+randomUUID();
const headers={'x-studio-client':'web',origin:'http://localhost:3000','content-type':'application/json'};
const ip='127.49.'+parseInt(suffix.slice(0,2),16)+'.'+parseInt(suffix.slice(2,4),16);
const savedEnv={CLAMAV_HOST:process.env.CLAMAV_HOST,CLAMAV_PORT:process.env.CLAMAV_PORT,CLAMAV_POLICY_CONFIRMED:process.env.CLAMAV_POLICY_CONFIRMED,ANIBISH_MAIL_ENABLED:process.env.ANIBISH_MAIL_ENABLED};
let signatureDate=new Date(),replyMode='clean',streams=0;
async function call(method:'GET'|'POST'|'PATCH',url:string,body:unknown={},cookie=''){
 return fixtureInject(app,{method,url,remoteAddress:ip,headers:{...headers,...(cookie?{cookie}:{})},...(method==='GET'?{}:{payload:JSON.stringify(body)})});
}
async function account(name:string){
 const email=`file-security-${name}-${suffix}@example.test`,created=await call('POST','/auth/register',{name,email,password});assert.equal(created.statusCode,201,created.body);
 const token=accountTokenFromLink(created.json().development_link);assert.equal((await call('POST','/auth/token',{token})).statusCode,200);
 const login=await call('POST','/auth/login',{email,password});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;return {cookie,user};
}
let owner:Awaited<ReturnType<typeof account>>,customer:typeof owner,other:typeof owner,noMfa:typeof owner;
before(async()=>{
 if(!process.env.DATABASE_URL?.includes('anibish_qa'))throw Error('File security tests require the dedicated anibish_qa database.');
 await migrate();app=await buildServer();owner=await account('owner');customer=await account('customer');other=await account('other');noMfa=await account('no-mfa');
 for(const user of[owner,noMfa])await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[user.user.id]);
 const setup=(await call('POST','/auth/mfa/setup',{password},owner.cookie)).json();assert.equal((await call('POST','/auth/mfa/verify',{password,code:totp(setup.secret)},owner.cookie)).statusCode,200);
 clamd=createServer(socket=>{let pending=Buffer.alloc(0),streaming=false;const chunks:Buffer[]=[];socket.on('data',chunk=>{pending=Buffer.concat([pending,chunk]);if(!streaming){const end=pending.indexOf(0);if(end<0)return;const command=pending.subarray(0,end).toString();pending=pending.subarray(end+1);if(command==='zVERSION'){socket.end('ClamAV 1.5.4/99999/'+signatureDate.toUTCString()+'\0');return;}assert.equal(command,'zINSTREAM');streaming=true;streams++;}while(pending.length>=4){const length=pending.readUInt32BE(0);if(pending.length<4+length)return;chunks.push(pending.subarray(4,4+length));pending=pending.subarray(4+length);if(length===0){const body=Buffer.concat(chunks);socket.end(replyMode==='limit'?'INSTREAM size limit exceeded. ERROR\0':replyMode==='encrypted'?'stream: Heuristics.Encrypted.Zip FOUND\0':replyMode==='malware'||body.includes('blocked-fixture')?'stream: Synthetic-Test-Match FOUND\0':'stream: OK\0');return;}}});});
 await new Promise<void>(r=>clamd.listen(0,'127.0.0.1',r));process.env.CLAMAV_HOST='127.0.0.1';process.env.CLAMAV_PORT=String((clamd.address() as {port:number}).port);process.env.CLAMAV_POLICY_CONFIRMED='true';
});
after(async()=>{await app?.close();await new Promise<void>(r=>clamd?.close(()=>r()));for(const [key,value]of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await pool.end();});
async function createFile(data:Buffer,name='source.zip',mime='application/zip',internal=false){
 const id=randomUUID(),key=id+'.bin';await mkdir(resolve(process.env.STORAGE_DIR||'storage'),{recursive:true});await writeFile(resolve(process.env.STORAGE_DIR||'storage',key),data,{mode:0o600});
 await pool.query('INSERT INTO files(id,org_id,user_id,name,mime,size,storage_key,sha256,internal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,customer.user.org_id,customer.user.id,name,mime,data.length,key,'test-hash',internal]);
 const scan=await enqueueFileScan('file',id,data,name,mime);return {id,scan,key};
}
const zip=(text:string)=>Buffer.concat([Buffer.from('504b0304','hex'),Buffer.from(text)]);
async function scan(ids:string[]){return runFileScanBatch(scanWithClamd,ids);}

test('safe filenames, strict magic and bounded code archives retain evidence without extraction',()=>{
 assert.equal(safeFileName('../../private\\bad\r\nname.txt'),'bad__name.txt');
 assert.equal(fileTypeEvidence(Buffer.from('MZ binary'),'image.png','image/png').reason,'EXECUTABLE_ATTACHMENT');
 assert.equal(fileTypeEvidence(Buffer.from('ordinary source text'),'image.png','image/png').reason,'MIME_MAGIC_MISMATCH');
 assert.equal(fileTypeEvidence(zip('source code'),'delivery.zip','application/zip').validation,'valid');
 assert.equal(fileTypeEvidence(Buffer.from('const answer = 42;'),'source.ts','text/plain').validation,'valid');
 assert.equal(fileTypeEvidence(Buffer.alloc(10*1024*1024+1,1),'large.zip','application/zip').reason,'FILE_SIZE_LIMIT');
});

test('bounded actual clamd TCP adapter distinguishes clean, infection, incomplete scan and stale signatures',async()=>{
 const bytes=zip('protocol fixture');assert.equal((await scanWithClamd(bytes)).status,'clean');
 replyMode='malware';assert.equal((await scanWithClamd(bytes)).status,'infected');
 replyMode='limit';assert.equal((await scanWithClamd(bytes)).reason,'SCANNER_LIMIT_EXCEEDED');
 replyMode='encrypted';assert.equal((await scanWithClamd(bytes)).status,'blocked');
 replyMode='clean';const count=streams;signatureDate=new Date(Date.now()-8*86400000);assert.equal((await scanWithClamd(bytes)).reason,'SCANNER_SIGNATURES_STALE');assert.equal(streams,count);signatureDate=new Date();
 process.env.CLAMAV_POLICY_CONFIRMED='false';assert.equal((await scanWithClamd(bytes)).reason,'SCANNER_POLICY_NOT_VERIFIED');process.env.CLAMAV_POLICY_CONFIRMED='true';
 assert.equal((await scanWithClamd(Buffer.alloc(12*1024*1024+1))).reason,'SCAN_SIZE_LIMIT');
});

test('scanner unavailability and timeout never become clean or release a pending download',async()=>{
 const bytes=zip('scanner failure '+suffix),file=await createFile(bytes),oldPort=process.env.CLAMAV_PORT;
 process.env.CLAMAV_PORT='1';assert.equal((await scanWithClamd(bytes)).reason,'SCANNER_UNAVAILABLE');
 await scan([file.scan.id]);assert.equal((await fileSecurityStatus('file',file.id)).status,'error');
 assert.equal((await call('GET','/files/'+file.id+'/download',{},customer.cookie)).statusCode,409);
 const sockets=new Set<import('node:net').Socket>(),silent=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise<void>(r=>silent.listen(0,'127.0.0.1',r));process.env.CLAMAV_PORT=String((silent.address() as {port:number}).port);process.env.CLAMAV_TIMEOUT_MS='1000';
 try{assert.equal((await scanWithClamd(bytes)).reason,'SCANNER_TIMEOUT');}finally{for(const socket of sockets)socket.destroy();await new Promise<void>(r=>silent.close(()=>r()));process.env.CLAMAV_PORT=oldPort;delete process.env.CLAMAV_TIMEOUT_MS;}
});

test('actual multipart uploads preserve mismatched bytes in quarantine and report pending safe archives',async()=>{
 const upload=async(name:string,mime:string,bytes:Buffer)=>{
  const boundary='qa-'+randomUUID(),payload=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+name+'"\r\nContent-Type: '+mime+'\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
  return fixtureInject(app,{method:'POST',url:'/files',remoteAddress:ip,headers:{...headers,cookie:customer.cookie,'content-type':'multipart/form-data; boundary='+boundary},payload});
 };
 const bad=await upload('photo.png','image/png',Buffer.from('plain source text'));assert.equal(bad.statusCode,200,bad.body);assert.equal(bad.json().scan_status,'blocked');assert.equal(bad.json().scan_reason,'MIME_MAGIC_MISMATCH');
 const persisted=(await pool.query('SELECT storage_key FROM files WHERE id=$1',[bad.json().id])).rows[0];assert.deepEqual(await readFile(resolve(process.env.STORAGE_DIR||'storage',persisted.storage_key)),Buffer.from('plain source text'));
 assert.equal((await call('GET','/files/'+bad.json().id+'/download',{},customer.cookie)).statusCode,423);
 const safe=await upload('delivery.zip','application/zip',zip('source delivery'));assert.equal(safe.statusCode,200,safe.body);assert.equal(safe.json().scan_status,'pending');
 assert.match(safe.json().message,/saved privately/);
});

test('scan queue persists across restart, is concurrently idempotent and retains immutable evidence',async()=>{
 const data=zip('durable queue '+suffix),file=await createFile(data),again=await enqueueFileScan('file',file.id,data,'source.zip','application/zip');assert.equal(again.id,file.scan.id);
 const before=streams;await Promise.all([scan([file.scan.id]),scan([file.scan.id])]);assert.equal(streams-before,1);assert.equal((await fileSecurityStatus('file',file.id)).downloadable,true);
 await pool.query("UPDATE file_scan_records SET status='scanning',locked_at=now()-interval '6 minutes' WHERE id=$1",[file.scan.id]);
 await app.close();app=await buildServer();await scan([file.scan.id]);assert.equal((await fileSecurityStatus('file',file.id)).status,'clean');
 await assert.rejects(pool.query("UPDATE file_scan_events SET event='changed' WHERE scan_id=$1",[file.scan.id]),/immutable/);
});

test('tenant and MFA authorization happen before scan disclosure; clean files download and stale results re-quarantine',async()=>{
 const data=zip('customer delivery '+suffix),file=await createFile(data);
 assert.equal((await call('GET','/files/'+file.id+'/download')).statusCode,401);
 assert.equal((await call('GET','/files/'+file.id+'/download',{},other.cookie)).statusCode,404);
 assert.equal((await call('GET','/files/'+file.id+'/security',{},other.cookie)).statusCode,404);
 assert.equal((await call('GET','/files/'+file.id+'/download',{},customer.cookie)).statusCode,409);
 await scan([file.scan.id]);const result=await call('GET','/files/'+file.id+'/download',{},customer.cookie);assert.equal(result.statusCode,200,result.body);assert.deepEqual(result.rawPayload,data);assert.equal(result.headers['x-content-type-options'],'nosniff');assert.equal(result.headers['cache-control'],'private, no-store');
 await pool.query("UPDATE file_scan_records SET signature_at=now()-interval '8 days' WHERE id=$1",[file.scan.id]);assert.equal((await call('GET','/files/'+file.id+'/download',{},customer.cookie)).statusCode,409);
 const privateFile=await createFile(data,'internal.zip','application/zip',true);assert.equal((await call('GET','/files/'+privateFile.id+'/download',{},customer.cookie)).statusCode,404);
});

test('infection and changed bytes block downloads while original storage is preserved',async()=>{
 const original=zip('blocked-fixture '+suffix),infected=await createFile(original);await scan([infected.scan.id]);assert.equal((await call('GET','/files/'+infected.id+'/download',{},customer.cookie)).statusCode,423);assert.deepEqual(await readFile(resolve(process.env.STORAGE_DIR||'storage',infected.key)),original);
 const changed=await createFile(zip('original bytes '+suffix));await writeFile(resolve(process.env.STORAGE_DIR||'storage',changed.key),zip('changed bytes'));await scan([changed.scan.id]);assert.equal((await fileSecurityStatus('file',changed.id)).reason,'SOURCE_HASH_CHANGED');assert.notEqual((await call('GET','/files/'+changed.id+'/download',{},customer.cookie)).statusCode,200);
});

test('private mail attachments remain cached, need fresh scans and cannot be accessed by customers or non-MFA admins',async()=>{
 const [mail]=(await pool.query("INSERT INTO mail_messages(mailbox,folder,uidvalidity,uid,subject,sender,recipients,body_text,body_html,flags,received_at) VALUES('mail','QA',1,$1,'Attachment QA','safe@example.test','mail@anibish.com','','','[]',now()) RETURNING id",[Math.floor(Math.random()*1000000000)])).rows;
 const bytes=zip('private mail '+suffix),[attachment]=(await pool.query('INSERT INTO mail_attachments(message_id,position,name,content,mime) VALUES($1,0,$2,$3,$4) RETURNING id',[mail.id,'mail.zip',bytes,'application/zip'])).rows;
 for(const [cookie,status]of[['',401],[customer.cookie,403],[noMfa.cookie,403]] as const)assert.equal((await call('GET','/email/attachments/'+attachment.id,{},cookie)).statusCode,status);
 assert.equal((await call('GET','/email/attachments/'+attachment.id,{},owner.cookie)).statusCode,409);
 const scanId=(await pool.query("SELECT id FROM file_scan_records WHERE source_kind='mail_attachment' AND source_id=$1",[attachment.id])).rows[0].id;await scan([scanId]);assert.equal((await call('GET','/email/attachments/'+attachment.id,{},owner.cookie)).statusCode,200);
 const body=(await call('GET','/email/messages/'+mail.id,{},owner.cookie)).json();assert.equal(body.attachments[0].scan_status,'clean');
});

test('mail synchronization retains quarantined attachments and reports over-cap messages without deleting provider originals',async()=>{
 const folder='QA-security-'+suffix,bytes=Buffer.from('MZ blocked fixture'),source=Buffer.from('From: safe@example.test\r\nTo: mail@anibish.com\r\nSubject: Quarantine QA\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="qa-boundary"\r\n\r\n--qa-boundary\r\nContent-Type: text/plain\r\n\r\nMessage text\r\n--qa-boundary\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="unsafe.exe"\r\nContent-Transfer-Encoding: base64\r\n\r\n'+bytes.toString('base64')+'\r\n--qa-boundary--\r\n');
 const client={mailbox:{uidValidity:1},getMailboxLock:async()=>({release(){}}),search:async()=>[1,2],fetchAll:async(_ids:string,fields:{size?:boolean})=>fields.size?[{uid:1,size:source.length,flags:new Set()},{uid:2,size:13*1024*1024,flags:new Set()}]:[{uid:1,flags:new Set()}],fetchOne:async()=>({source})} as unknown as ImapFlow;
 const result=await syncMailbox('mail',folder,async(_account,action)=>action(client));assert.equal(result.synced,1);assert.equal(result.skipped,1);
 const rows=(await pool.query("SELECT a.content,s.status,s.reason FROM mail_attachments a JOIN mail_messages m ON m.id=a.message_id JOIN file_scan_records s ON s.source_id=a.id::text AND s.source_kind='mail_attachment' WHERE m.folder=$1",[folder])).rows;
 assert.equal(rows.length,1);assert.deepEqual(rows[0].content,bytes);assert.equal(rows[0].status,'blocked');assert.equal(rows[0].reason,'EXECUTABLE_ATTACHMENT');
});

test('outbound composition cannot send or sync unscanned bytes, including filename-based quarantine',async()=>{
 const bytes=zip('composed archive '+suffix),attachment={name:'source.zip',base64:bytes.toString('base64')};
 await assert.rejects(requireCleanComposition([attachment]),/awaiting a verified malware scan/);
 const scanRow=(await pool.query("SELECT id FROM file_scan_records WHERE source_kind='composition' AND sha256=encode(sha256($1::bytea),'hex')",[bytes])).rows[0];await scan([scanRow.id]);await requireCleanComposition([attachment]);
 await assert.rejects(requireCleanComposition([{...attachment,name:'payload.exe'}]),/quarantined/);
 const bad={name:'blocked.exe',base64:Buffer.from('MZ sample').toString('base64')};process.env.ANIBISH_MAIL_ENABLED='true';
 const before=(await pool.query('SELECT count(*) FROM mail_sends')).rows[0].count;
 const send=await call('POST','/email/send',{mailbox:'mail',recipient:'safe@example.test',subject:'Not sent',body:'Security QA',idempotency_key:randomUUID(),extras:{cc:[],attachments:[bad]}},owner.cookie);assert.equal(send.statusCode,423,send.body);assert.equal((await pool.query('SELECT count(*) FROM mail_sends')).rows[0].count,before);
 const draft=await call('POST','/email/drafts',{mailbox:'mail',recipient:'',subject:'Private draft retained',body:'Security QA',extras:{cc:[],attachments:[bad]}},owner.cookie);assert.equal(draft.statusCode,200,draft.body);
 const {enqueueProviderDraft}=await import('../provider-drafts');await assert.rejects(enqueueProviderDraft(draft.json().id,draft.json().revision,owner.user),/quarantined/);
 assert.equal((await pool.query('SELECT 1 FROM mail_draft_sync_jobs WHERE draft_id=$1',[draft.json().id])).rowCount,0);
});

test('public media needs both explicit publication approval and a verified clean scan',async()=>{
 const bytes=Buffer.from('89504e470d0a1a0a0000000049454e44ae426082','hex'),file=await createFile(bytes,'gallery.png','image/png');
 assert.equal((await call('GET','/public/media/'+file.id)).statusCode,404);
 const body={publication_rights_confirmed:true,approved:true};
 assert.equal((await call('POST','/cms/media/'+file.id+'/approve',body,customer.cookie)).statusCode,403);
 assert.equal((await call('POST','/cms/media/'+file.id+'/approve',body,owner.cookie)).statusCode,409);
 await scan([file.scan.id]);assert.equal((await call('GET','/public/media/'+file.id)).statusCode,404);
 assert.equal((await call('POST','/cms/media/'+file.id+'/approve',body,owner.cookie)).statusCode,200);
 assert.equal((await call('GET','/public/media/'+file.id)).statusCode,200);
 await pool.query("UPDATE file_scan_records SET signature_at=now()-interval '8 days' WHERE id=$1",[file.scan.id]);assert.equal((await call('GET','/public/media/'+file.id)).statusCode,409);
});

test('customer delivery cannot announce internal, quarantined or pending attachments as ready',async()=>{
 const project=await call('POST','/projects',{title:'Attachment delivery QA '+suffix,org_id:customer.user.org_id},owner.cookie);assert.equal(project.statusCode,200,project.body);
 const data=zip('verified delivery '+suffix),pending=await createFile(data),internal=await createFile(data,'internal.zip','application/zip',true),blocked=await createFile(Buffer.from('MZ private binary'),'blocked.exe','application/octet-stream');
 const payload={project_id:project.json().id,title:'Verified customer handover',note:'Synthetic delivery security validation.',file_ids:[internal.id]};
 assert.equal((await call('POST','/deliveries',payload,owner.cookie)).statusCode,400);
 assert.equal((await call('POST','/deliveries',{...payload,file_ids:[blocked.id]},owner.cookie)).statusCode,423);
 assert.equal((await call('POST','/deliveries',{...payload,file_ids:[pending.id]},owner.cookie)).statusCode,409);
 assert.equal((await pool.query('SELECT 1 FROM deliveries WHERE project_id=$1',[project.json().id])).rowCount,0);
 await scan([pending.scan.id]);const delivered=await call('POST','/deliveries',{...payload,file_ids:[pending.id]},owner.cookie);assert.equal(delivered.statusCode,200,delivered.body);
 assert.deepEqual(delivered.json().file_ids,[pending.id]);
});

test('deployment preflight rechecks all approved media before allowing API startup',async()=>{
 const {verifyApprovedPublicMedia}=await import('../file-security-preflight');
 const result=await verifyApprovedPublicMedia();assert.equal(result.all_clean,true);assert.ok(result.approved_public_media>0);
 const rows=(await pool.query('SELECT id FROM files WHERE public_approved=true AND internal=false')).rows;
 for(const row of rows)assert.equal((await fileSecurityStatus('file',row.id)).downloadable,true);
});

test('daily proactive rechecks preserve fresh prior proof while new scans cannot bypass quarantine',async()=>{
 const existing=await createFile(zip('daily rescan '+suffix));await scan([existing.scan.id]);
 await pool.query("UPDATE file_scan_records SET scanned_at=now()-interval '25 hours' WHERE id=$1",[existing.scan.id]);
 let enter!:()=>void,release!:(result:{status:'error';reason:string})=>void;
 const entered=new Promise<void>(r=>enter=r),gate=new Promise<{status:'error';reason:string}>(r=>release=r);
 const processing=runFileScanBatch(async()=>{enter();return gate;},[existing.scan.id]);await entered;
 assert.equal((await fileSecurityStatus('file',existing.id)).status,'scanning');assert.equal((await fileSecurityStatus('file',existing.id)).downloadable,true);
 assert.equal((await call('GET','/files/'+existing.id+'/download',{},customer.cookie)).statusCode,200);
 const freshFile=await createFile(zip('never scanned '+suffix));let newEnter!:()=>void,newRelease!:(result:{status:'clean';reason:string;version:string;signatureAt:Date})=>void;
 const newEntered=new Promise<void>(r=>newEnter=r),newGate=new Promise<{status:'clean';reason:string;version:string;signatureAt:Date}>(r=>newRelease=r);
 const freshProcessing=runFileScanBatch(async()=>{newEnter();return newGate;},[freshFile.scan.id]);await newEntered;
 assert.equal((await fileSecurityStatus('file',freshFile.id)).status,'scanning');assert.equal((await fileSecurityStatus('file',freshFile.id)).downloadable,false);
 assert.equal((await call('GET','/files/'+freshFile.id+'/download',{},customer.cookie)).statusCode,409);
 release({status:'error',reason:'SCANNER_UNAVAILABLE'});await processing;
 assert.equal((await call('GET','/files/'+existing.id+'/download',{},customer.cookie)).statusCode,409);
 newRelease({status:'clean',reason:'',version:'ClamAV 1.5.4/99999/'+new Date().toUTCString(),signatureAt:new Date()});await freshProcessing;
 assert.equal((await fileSecurityStatus('file',freshFile.id)).downloadable,true);
});
