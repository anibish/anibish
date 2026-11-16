import {after,afterEach,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {access,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {digest} from '../security';
import {fixtureInject} from './auth-factor-fixture';
import {accountTokenFromLink} from './account-link-fixture';
import {FILE_UPLOAD_QUOTA_LOCK,fileUploadAdmissionState,persistFileWithinQuota,validateUploadBytes} from '../file-upload-quota';

const keys=['USER_BYTES','ORG_BYTES','APP_BYTES','USER_COUNT','ORG_COUNT','APP_COUNT','MIN_FREE_BYTES','CONCURRENCY'].map(k=>'ANIBISH_UPLOAD_'+k);
const savedEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
function resetLimits(){for(const key of keys)delete process.env[key];}
function configure(values:Record<string,number|string>){resetLimits();for(const [name,value]of Object.entries(values))process.env['ANIBISH_UPLOAD_'+name]=String(value);}
const suffix=randomUUID().slice(0,8),password='Quota-test-'+randomUUID(),root=resolve(process.env.STORAGE_DIR||'storage');
const headers={origin:'http://localhost:3000','x-studio-client':'web','content-type':'application/json'};
const ip='127.59.'+parseInt(suffix.slice(0,2),16)+'.'+parseInt(suffix.slice(2,4),16);
let app:Awaited<ReturnType<typeof buildServer>>;
async function call(method:'GET'|'POST',url:string,body:unknown={},cookie=''){
 return fixtureInject(app,{method,url,remoteAddress:ip,headers:{...headers,...cookie?{cookie}:{}},...method==='GET'?{}:{payload:JSON.stringify(body)}});
}
async function account(name:string){
 const email=`quota-${name}-${suffix}@example.test`,created=await call('POST','/auth/register',{name,email,password});assert.equal(created.statusCode,201,created.body);
 assert.equal((await call('POST','/auth/token',{token:accountTokenFromLink(created.json().development_link)})).statusCode,200);
 const login=await call('POST','/auth/login',{email,password});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;return {cookie,user};
}
let one:Awaited<ReturnType<typeof account>>,two:typeof one,peer:typeof one,noMfa:typeof one;
async function upload(bytes:Buffer,cookie=one.cookie,fields:Record<string,string>={},name='quota.txt',mime='text/plain'){
 const boundary='quota-'+randomUUID(),parts=Object.entries(fields).map(([key,value])=>Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"\r\n\r\n'+value+'\r\n'));
 const payload=Buffer.concat([...parts,Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+name+'"\r\nContent-Type: '+mime+'\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
 return fixtureInject(app,{method:'POST',url:'/files',remoteAddress:ip,headers:{...headers,cookie,'content-type':'multipart/form-data; boundary='+boundary},payload});
}
async function usage(user=one.user.id,org=one.user.org_id){
 const row=(await pool.query(`SELECT count(*)::int AS app_count,COALESCE(sum(size),0)::text AS app_bytes,
 count(*) FILTER(WHERE user_id=$1)::int AS user_count,COALESCE(sum(size) FILTER(WHERE user_id=$1),0)::text AS user_bytes,
 count(*) FILTER(WHERE org_id=$2)::int AS org_count,COALESCE(sum(size) FILTER(WHERE org_id=$2),0)::text AS org_bytes FROM files`,[user,org])).rows[0];
 return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Number(v)]));
}
async function snapshot(){return {files:(await readdir(root)).sort(),usage:await usage(),scans:Number((await pool.query('SELECT count(*) FROM file_scan_records')).rows[0].count),audits:Number((await pool.query("SELECT count(*) FROM audit_log WHERE action='file.uploaded'")).rows[0].count)};}
async function stored(id:string){const row=(await pool.query('SELECT * FROM files WHERE id=$1',[id])).rows[0];return {...row,bytes:await readFile(resolve(root,row.storage_key))};}
before(async()=>{
 const url=new URL(process.env.DATABASE_URL||'');if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(url.pathname))throw Error('Upload quota tests require an isolated local QA database.');
 resetLimits();await migrate();await mkdir(root,{recursive:true});app=await buildServer();one=await account('one');two=await account('two');peer=await account('peer');noMfa=await account('no-mfa');
 await pool.query("INSERT INTO memberships(user_id,org_id,role) VALUES($1,$2,'member')",[peer.user.id,one.user.org_id]);
 assert.equal((await call('POST','/auth/organization',{org_id:one.user.org_id},peer.cookie)).statusCode,200);
 await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[noMfa.user.id]);
});
afterEach(()=>{resetLimits();assert.equal(fileUploadAdmissionState().active,0);});
after(async()=>{await app?.close();for(const [key,value]of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await pool.end();});

test('persisted user-byte quotas include quarantined bytes; rejection leaves rows, scans, audits and files unchanged',async()=>{
 const data=Buffer.from('quota-evidence'),first=await upload(data,one.cookie,{},'mismatch.png','image/png');assert.equal(first.statusCode,200,first.body);assert.equal(first.json().scan_status,'blocked');
 const row=await stored(first.json().id);assert.deepEqual(row.bytes,data);assert.equal(Number(row.size),data.length);assert.equal(row.sha256,digest(data));
 const before=await snapshot(),u=await usage();configure({USER_BYTES:u.user_bytes+3});
 const rejected=await upload(Buffer.from('four'));assert.equal(rejected.statusCode,413,rejected.body);assert.match(rejected.json().error,/account.*allowance/);assert.deepEqual(await snapshot(),before);
 assert.equal((await call('GET','/files/'+row.id+'/download',{},two.cookie)).statusCode,404);
});

test('per-user record quotas use actual persisted counts without blocking another customer',async()=>{
 const u=await usage();configure({USER_COUNT:Math.max(1,u.user_count)});const before=await snapshot();
 assert.equal((await upload(Buffer.from('count'))).statusCode,413);assert.deepEqual(await snapshot(),before);
 const different=await upload(Buffer.from('other user'),two.cookie);assert.equal(different.statusCode,200,different.body);
});

test('workspace byte and count quotas aggregate two different members in the same organization',async()=>{
 const u=await usage();configure({ORG_BYTES:u.org_bytes+3});let before=await snapshot();
 const rejected=await upload(Buffer.from('four'),peer.cookie);assert.equal(rejected.statusCode,413,rejected.body);assert.match(rejected.json().error,/workspace.*allowance/);assert.deepEqual(await snapshot(),before);
 configure({ORG_COUNT:Math.max(1,u.org_count)});before=await snapshot();assert.equal((await upload(Buffer.from('x'),peer.cookie)).statusCode,413);assert.deepEqual(await snapshot(),before);
});

test('application byte and count limits aggregate independent organizations and give a safe capacity explanation',async()=>{
 let u=await usage();configure({APP_BYTES:u.app_bytes+3});let before=await snapshot();const denied=await upload(Buffer.from('four'),two.cookie);assert.equal(denied.statusCode,507,denied.body);assert.match(denied.json().error,/capacity.*Contact/);assert.deepEqual(await snapshot(),before);
 u=await usage();configure({APP_COUNT:Math.max(1,u.app_count)});before=await snapshot();assert.equal((await upload(Buffer.from('x'),two.cookie)).statusCode,507);assert.deepEqual(await snapshot(),before);
});

test('disk reserve and invalid limits reject before writing without leaking provider or filesystem details',async()=>{
 configure({MIN_FREE_BYTES:Number.MAX_SAFE_INTEGER});let before=await snapshot();const denied=await upload(Buffer.from('headroom'));assert.equal(denied.statusCode,507,denied.body);assert.match(denied.json().error,/safe disk headroom/);assert.deepEqual(await snapshot(),before);
 configure({USER_BYTES:'invalid-private-value'});before=await snapshot();const invalid=await upload(Buffer.from('invalid limit'));assert.equal(invalid.statusCode,503,invalid.body);assert.match(invalid.json().error,/administrator attention/);assert.equal(invalid.body.includes('invalid-private-value'),false);assert.deepEqual(await snapshot(),before);
});

test('concurrent real multipart uploads cannot exceed a one-file persisted byte budget',async()=>{
 const u=await usage(),data=Buffer.from('concurrent-budget');configure({USER_BYTES:u.user_bytes+data.length});
 const before=await snapshot(),responses=await Promise.all([upload(data),upload(data)]);assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,413]);
 const after=await snapshot();assert.equal(after.usage.user_bytes-before.usage.user_bytes,data.length);assert.equal(after.usage.app_count-before.usage.app_count,1);assert.equal(after.files.length-before.files.length,1);assert.equal(after.scans-before.scans,1);assert.equal(after.audits-before.audits,1);
 const successful=responses.find(r=>r.statusCode===200)!;assert.deepEqual((await stored(successful.json().id)).bytes,data);
});

test('two admitted uploads are bounded before buffering; a third is rejected and capacity is released',async()=>{
 const lock=await pool.connect();await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock($1)',[FILE_UPLOAD_QUOTA_LOCK]);
 const waiting=[upload(Buffer.from('first admitted')),upload(Buffer.from('second admitted'))];let released=false;
 try{
  const until=Date.now()+5000;while(fileUploadAdmissionState().active<2&&Date.now()<until)await new Promise(r=>setTimeout(r,10));assert.equal(fileUploadAdmissionState().active,2);
  const denied=await upload(Buffer.from('not admitted'));assert.equal(denied.statusCode,429,denied.body);assert.match(denied.json().error,/Wait.*retry/);assert.equal(fileUploadAdmissionState().active,2);
  await lock.query('COMMIT');released=true;for(const result of await Promise.all(waiting))assert.equal(result.statusCode,200,result.body);
 }finally{if(!released)await lock.query('ROLLBACK');lock.release();await Promise.allSettled(waiting);}
 assert.equal(fileUploadAdmissionState().active,0);
});

test('a failed row transaction removes only its newly written orphan and preserves an existing file',async()=>{
 const before=await snapshot(),id=randomUUID(),key=id+'.bin',preserved=before.files[0],old=await readFile(resolve(root,preserved));
 await assert.rejects(persistFileWithinQuota({id,key,userId:one.user.id,orgId:one.user.org_id,root,data:Buffer.from('rollback evidence')},async db=>{
  await db.query('INSERT INTO files(id,user_id,org_id,name,mime,size,storage_key,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,one.user.id,one.user.org_id,'rollback.txt','text/plain',17,key,digest('rollback evidence')]);throw Error('Synthetic save failure');
 }),/Synthetic save failure/);
 await assert.rejects(access(resolve(root,key)));assert.equal((await pool.query('SELECT 1 FROM files WHERE id=$1',[id])).rowCount,0);assert.deepEqual(await readFile(resolve(root,preserved)),old);assert.deepEqual(await snapshot(),before);
});

test('an existing storage destination is never overwritten or removed after an exclusive-create failure',async()=>{
 const id=randomUUID(),key=id+'.bin',bytes=Buffer.from('preserve existing destination');await writeFile(resolve(root,key),bytes,{flag:'wx'});
 const before=await snapshot();await assert.rejects(persistFileWithinQuota({id,key,userId:one.user.id,orgId:one.user.org_id,root,data:Buffer.from('replacement')},async()=>({})),{code:'EEXIST'});
 assert.deepEqual(await readFile(resolve(root,key)),bytes);assert.deepEqual(await snapshot(),before);
});

test('unacknowledged successful COMMIT is reconciled from the real database without deleting persisted bytes',async()=>{
 const id=randomUUID(),key=id+'.bin',data=Buffer.from('acknowledged from authoritative row'),db=await pool.connect(),connect=pool.connect.bind(pool),query=db.query.bind(db);let intercepted=false;
 const originalConnect=pool.connect;
 (pool as unknown as {connect:()=>Promise<typeof db>}).connect=async()=>{if(!intercepted){intercepted=true;return db;}return connect();};
 db.query=(async(...args:Parameters<typeof query>)=>{const result=await query(...args);if(args[0]==='COMMIT'){db.query=query;throw Error('Synthetic transport acknowledgment loss');}return result;}) as typeof db.query;
 try{
  const result=await persistFileWithinQuota({id,key,userId:one.user.id,orgId:one.user.org_id,root,data},async client=>{
   await client.query('INSERT INTO files(id,user_id,org_id,name,mime,size,storage_key,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,one.user.id,one.user.org_id,'ack.txt','text/plain',data.length,key,digest(data)]);return {id};
  });pool.connect=originalConnect;assert.deepEqual(result,{id});assert.deepEqual((await stored(id)).bytes,data);
 }finally{pool.connect=originalConnect;db.query=query;}
});

test('oversized/truncated multipart never persists partial bytes and all authorization failures release admission',async()=>{
 const before=await snapshot();const oversized=await upload(Buffer.alloc(10*1024*1024+1,65));assert.equal(oversized.statusCode,413,oversized.body);assert.deepEqual(await snapshot(),before);
 assert.throws(()=>validateUploadBytes(Buffer.from('partial'),true),/No partial file/);
 assert.equal((await upload(Buffer.from('wrong tenant'),one.cookie,{org_id:two.user.org_id})).statusCode,403);
 assert.equal((await upload(Buffer.from('private'),one.cookie,{internal:'true'})).statusCode,403);
 assert.equal((await upload(Buffer.from('no mfa'),noMfa.cookie)).statusCode,403);
 assert.equal((await upload(Buffer.from('unsupported'),one.cookie,{},'binary.exe','application/octet-stream')).statusCode,400);
 assert.equal((await upload(Buffer.alloc(0))).statusCode,400);assert.deepEqual(await snapshot(),before);
 const valid=await upload(Buffer.from('capacity remains usable'));assert.equal(valid.statusCode,200,valid.body);
});
