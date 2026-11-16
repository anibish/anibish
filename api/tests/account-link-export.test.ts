import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {digest} from '../security';
import {freshTotp} from './auth-factor-fixture';
import {accountTokenFromLink} from './account-link-fixture';

let app:Awaited<ReturnType<typeof buildServer>>;
const suffix=randomUUID().slice(0,8),password='Isolated-links-'+randomUUID();
const headers={origin:'http://localhost:3000','x-studio-client':'web','content-type':'application/json'};
const address='127.46.'+parseInt(suffix.slice(0,2),16)+'.'+parseInt(suffix.slice(2,4),16);
async function call(method:'GET'|'POST',url:string,body:unknown={},cookie=''){
 return app.inject({method,url,remoteAddress:address,headers:{...headers,...cookie?{cookie}:{}},...method==='GET'?{}:{payload:JSON.stringify(body)}});
}
async function account(label:string){
 const email='links-'+label+'-'+suffix+'@example.test';
 const created=await call('POST','/auth/register',{name:label,email,password,organization:'Isolated link QA '+label});assert.equal(created.statusCode,201);
 const link=String(created.json().development_link),token=accountTokenFromLink(link);assert.ok(token);
 const url=new URL(link,'http://localhost');assert.equal(url.search,'');assert.equal(new URLSearchParams(url.hash.slice(1)).get('kind'),'verify');
 assert.equal((await pool.query('SELECT count(*) AS n FROM auth_tokens WHERE id=$1',[digest(token!)])).rows[0].n,'1');assert.equal((await pool.query('SELECT count(*) AS n FROM auth_tokens WHERE id=$1',[token])).rows[0].n,'0');
 assert.equal((await call('POST','/auth/token',{token})).statusCode,200);
 const login=await call('POST','/auth/login',{email,password});assert.equal(login.statusCode,200);
 const cookie=String(login.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;
 return {email,cookie,user,link,token};
}
let owner:Awaited<ReturnType<typeof account>>,one:typeof owner,two:typeof owner;
before(async()=>{
 const url=process.env.DATABASE_URL?new URL(process.env.DATABASE_URL):null;
 if(!url||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(url.pathname)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Strict local-only isolated QA database required.');
 await migrate();app=await buildServer();one=await account('one');two=await account('two');owner=await account('owner');
 await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[owner.user.id]);
 const setup=await call('POST','/auth/mfa/setup',{password},owner.cookie);assert.equal(setup.statusCode,200);
 const verified=await call('POST','/auth/mfa/verify',{password,code:freshTotp(setup.json().secret)},owner.cookie);assert.equal(verified.statusCode,200);if(verified.headers['set-cookie'])owner.cookie=String(verified.headers['set-cookie']);
});
after(async()=>{await app?.close();await pool.end()});

test('registration email stores a fragment action URL and only a hashed single-use verification token',async()=>{
 const [mail]=(await pool.query("SELECT payload FROM outbox WHERE recipient=$1 AND template='verify' ORDER BY created_at DESC LIMIT 1",[one.email])).rows;
 const url=new URL(mail.payload.url);assert.equal(url.pathname,'/account');assert.equal(url.search,'');assert.equal(new URLSearchParams(url.hash.slice(1)).get('token'),one.token);
 assert.equal((await pool.query('SELECT count(*) AS n FROM auth_tokens WHERE id=$1',[one.token])).rows[0].n,'0');
 assert.equal((await pool.query('SELECT count(*) AS n FROM auth_tokens WHERE id=$1',[digest(one.token!)])).rows[0].n,'0');
 assert.equal((await call('POST','/auth/token',{token:one.token})).statusCode,400);
});

test('recovery email fragment redeems through explicit POST once and revokes old sessions',async()=>{
 const recovered=await call('POST','/auth/recover',{email:one.email});assert.equal(recovered.statusCode,200);
 const link=String(recovered.json().development_link),url=new URL(link,'http://localhost');assert.equal(url.search,'');
 const token=accountTokenFromLink(link);assert.ok(token);assert.equal(new URLSearchParams(url.hash.slice(1)).get('kind'),'reset');
 const [mail]=(await pool.query("SELECT payload FROM outbox WHERE recipient=$1 AND template='reset' ORDER BY created_at DESC LIMIT 1",[one.email])).rows;assert.equal(new URL(mail.payload.url).search,'');
 assert.equal((await call('GET','/auth/token?token='+token)).statusCode,404);
 const nextPassword='Changed-isolated-'+randomUUID();assert.equal((await call('POST','/auth/token',{token,password:nextPassword})).statusCode,200);
 assert.equal((await call('POST','/auth/token',{token,password:nextPassword})).statusCode,400);
 assert.equal((await call('GET','/auth/me',{},one.cookie)).statusCode,401);
 const login=await call('POST','/auth/login',{email:one.email,password:nextPassword});assert.equal(login.statusCode,200);one.cookie=String(login.headers['set-cookie']);
});

test('invitation email uses a fragment and server redemption remains bound to the invited identity',async()=>{
 const r=await call('POST','/invitations',{email:two.email,role:'member',idempotency_key:randomUUID()},one.cookie);assert.equal(r.statusCode,200);
 const [mail]=(await pool.query("SELECT payload FROM outbox WHERE recipient=$1 AND template='organization_invitation' ORDER BY created_at DESC LIMIT 1",[two.email])).rows;
 const url=new URL(mail.payload.url);assert.equal(url.search,'');const params=new URLSearchParams(url.hash.slice(1)),token=params.get('token');assert.equal(params.get('kind'),'invitation');assert.ok(token);
 assert.equal((await call('POST','/invitations/accept',{token},owner.cookie)).statusCode,400);
 assert.equal((await call('POST','/invitations/accept',{token},two.cookie)).statusCode,200);
 assert.equal((await call('POST','/invitations/accept',{token},two.cookie)).statusCode,400);
 assert.equal((await pool.query('SELECT count(*) AS n FROM memberships WHERE user_id=$1 AND org_id=$2',[two.user.id,one.user.org_id])).rows[0].n,'1');
});

test('actual finance and enquiry exports neutralize dangerous cells and retain staff-only authorization',async()=>{
 for(const path of ['/finance/export','/reports/export']){assert.equal((await call('GET',path)).statusCode,401);assert.equal((await call('GET',path,{},two.cookie)).statusCode,403)}
 const title='\t=HYPERLINK("https://example.invalid","QA") '+suffix;
 await pool.query("INSERT INTO leads(org_id,title,email,brief,status) VALUES($1,$2,$3,'Synthetic export safety fixture','new')",[one.user.org_id,title,one.email]);
 const enquiries=await call('GET','/reports/export',{},owner.cookie);assert.equal(enquiries.statusCode,200);assert.match(String(enquiries.headers['content-type']),/^text\/csv/);assert.ok(enquiries.body.includes('"\'\t=HYPERLINK(""https://example.invalid"",""QA"") '+suffix+'"'));
 const order=(await pool.query("INSERT INTO orders(org_id,title,total,currency) VALUES($1,'Synthetic CSV order',100,'INR') RETURNING id",[one.user.org_id])).rows[0];
 const number=' =SUM(1,1) '+suffix;await pool.query("INSERT INTO invoices(org_id,order_id,number,total,currency) VALUES($1,$2,$3,100,'INR')",[one.user.org_id,order.id,number]);
 const finance=await call('GET','/finance/export',{},owner.cookie);assert.equal(finance.statusCode,200);assert.ok(finance.body.includes('"\' =SUM(1,1) '+suffix+'"'));assert.ok(finance.body.includes('\r\n'));
});
