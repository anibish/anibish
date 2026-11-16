import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,scrypt} from 'node:crypto';
import {hashNewPassword,validateNewPassword,NEW_PASSWORD_ERROR} from '../password-policy';
import {hashPassword,verifyPassword,passwordHashNeedsUpgrade,digest} from '../security';
import {buildServer} from '../server';
import {migrate} from '../migrate';
import {pool} from '../db';
import {accountTokenFromLink} from './account-link-fixture';

test('modest local screening rejects common twelve-plus-character passwords and simple case/separator/leet variants',()=>{
 const weak=['password1234','Password123456!','password-password','qwerty123456','qwertyuiop123','123456789012','123456123456','123123123123','administrator','welcome123456','letmein123456','changeme12345','iloveyou12345','monkeymonkey','abc123abc123','p@ssw0rd12345!','ＰＡＳＳＷＯＲＤ１２３４５６'];
 for(const password of weak){assert.ok(password.length>=12);assert.throws(()=>validateNewPassword(password),{name:'NewPasswordPolicyError',message:NEW_PASSWORD_ERROR});}
});
test('predictable brand and supplied account-context patterns are rejected without banning unrelated passphrases containing those words',()=>{
 for(const password of['Anibish123456!','Anibish.com2026!!','AnilBishnoi2026!','Bishnoi123456!'])assert.throws(()=>validateNewPassword(password),/less predictable/);
 const context={name:'Sample Person',email:'sampleclient@example.test',organization:'Orbit Studio'};
 for(const password of['SamplePerson1234!','sampleclient1234!','Orbit-Studio2026!'])assert.throws(()=>validateNewPassword(password,context),/less predictable/);
 for(const password of['Anibish learns from violet rivers and lanterns','Orbit Studio: amber whales dance at dawn','twelve cobalt otters carry quiet lanterns'])assert.doesNotThrow(()=>validateNewPassword(password,context));
});
test('repeated codepoints are rejected, including astral Unicode and NUL, with unchanged twelve-to128-code-unit boundaries',()=>{
 for(const password of['a'.repeat(12),'9'.repeat(128),'🔒'.repeat(6),'密'.repeat(20),'\0'.repeat(12),'short','x'.repeat(129)])assert.throws(()=>validateNewPassword(password),/less predictable/);
 assert.doesNotThrow(()=>validateNewPassword('密碼🚀'.repeat(32)));assert.equal('密碼🚀'.repeat(32).length,128);
});
test('accepted Unicode,128-code-unit and embedded-NUL credentials are hashed exactly without screening normalization',async()=>{
 for(const password of['Ａzure-海雨-cobalt-lantern!','密碼🚀'.repeat(32),'violet\0river\0lantern2026!']){const stored=await hashNewPassword(password);assert.equal(await verifyPassword(password,stored),true);assert.equal(await verifyPassword(password+'x',stored),false);if(password!==password.normalize('NFKC'))assert.equal(await verifyPassword(password.normalize('NFKC'),stored),false);}
});
async function legacy(password:string){const salt=randomBytes(16).toString('hex'),key=await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1},(error,result)=>error?reject(error):resolve(result)));return salt+':'+key.toString('hex');}
test('existing low-level hash verification and legacy Unicode/NUL passwords remain compatible even when a new weak credential is refused',async()=>{
 for(const password of['password1234','historical\0password','密碼🚀'.repeat(32)]){const old=await legacy(password);assert.equal(await verifyPassword(password,old),true);assert.equal(passwordHashNeedsUpgrade(old),true);const upgraded=await hashPassword(password);assert.equal(await verifyPassword(password,upgraded),true);}
 await assert.rejects(hashNewPassword('password1234'),/less predictable/);
});

const suffix=randomUUID().slice(0,8),strong='Violet-river-lantern-'+randomUUID(),headers={origin:'http://localhost:3000','x-studio-client':'web','content-type':'application/json'};let app:Awaited<ReturnType<typeof buildServer>>,seq=0;
async function call(method:'GET'|'POST',url:string,body:unknown={},cookie=''){return app.inject({method,url,remoteAddress:'127.93.'+Math.floor(++seq/250)+'.'+seq%250,headers:{...headers,...cookie?{cookie}:{}},...method==='GET'?{}:{payload:JSON.stringify(body)}});}
async function subject(label:string){const email=`new-policy-${label}-${suffix}@example.test`,created=await call('POST','/auth/register',{name:'Sample Person',email,password:strong});assert.equal(created.statusCode,201,created.body);assert.equal((await call('POST','/auth/token',{token:accountTokenFromLink(created.json().development_link)})).statusCode,200);const login=await call('POST','/auth/login',{email,password:strong});assert.equal(login.statusCode,200,login.body);const cookie=String(login.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;return {cookie,user,email};}
before(async()=>{const url=new URL(process.env.DATABASE_URL||'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(url.pathname))throw Error('Dedicated local QA database required.');await migrate();app=await buildServer();});
after(async()=>{await app?.close();await pool.end();});
test('registration, change and reset return one non-sensitive weak-password error, preserving account/session/token state until a valid retry',async()=>{
 const s=await subject('errors'),oldHash=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[s.user.id])).rows[0].password_hash;
 for(const weak of['Password123456!','SamplePerson1234!']){
  const email='rejected-'+randomUUID()+'@example.test',registration=await call('POST','/auth/register',{name:'Sample Person',email,password:weak});assert.equal(registration.statusCode,400);assert.equal(registration.json().error,NEW_PASSWORD_ERROR);assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1',[email])).rowCount,0);
  const changed=await call('POST','/auth/password',{current_password:strong,new_password:weak},s.cookie);assert.equal(changed.statusCode,400);assert.equal(changed.json().error,NEW_PASSWORD_ERROR);assert.equal((await call('GET','/auth/me',{},s.cookie)).statusCode,200);
  const recover=await call('POST','/auth/recover',{email:s.email}),token=accountTokenFromLink(recover.json().development_link)!;const reset=await call('POST','/auth/token',{token,password:weak});assert.equal(reset.statusCode,400);assert.equal(reset.json().error,NEW_PASSWORD_ERROR);assert.equal((await pool.query('SELECT 1 FROM auth_tokens WHERE id=$1',[digest(token)])).rowCount,1);
  for(const response of[registration,changed,reset])assert.equal(response.body.includes(weak),false);
  assert.equal((await pool.query('SELECT password_hash FROM users WHERE id=$1',[s.user.id])).rows[0].password_hash,oldHash);
 }
 const recover=await call('POST','/auth/recover',{email:s.email}),token=accountTokenFromLink(recover.json().development_link)!,replacement='Cobalt-otter-lantern-'+randomUUID();assert.equal((await call('POST','/auth/token',{token,password:replacement})).statusCode,200);assert.equal((await call('GET','/auth/me',{},s.cookie)).statusCode,401);assert.equal(await verifyPassword(replacement,(await pool.query('SELECT password_hash FROM users WHERE id=$1',[s.user.id])).rows[0].password_hash),true);
});
test('a successful existing weak legacy login still upgrades and signs in without applying new-password screening',async()=>{
 const s=await subject('legacy'),weak='password1234';await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await legacy(weak),s.user.id]);await pool.query('DELETE FROM sessions WHERE user_id=$1',[s.user.id]);
 for(let i=0;i<2;i++){const login=await call('POST','/auth/login',{email:s.email,password:weak});assert.equal(login.statusCode,200,login.body);const saved=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[s.user.id])).rows[0].password_hash;assert.equal(passwordHashNeedsUpgrade(saved),false);assert.equal(await verifyPassword(weak,saved),true);}
});
