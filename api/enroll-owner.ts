import {stdin,stdout} from 'node:process';
import {pool,transaction} from './db';
import {mfaSecret,verifyTotp,encryptSecret} from './security';
import {hashNewPassword,validateNewPassword} from './password-policy';
async function hidden(prompt:string){
 if(!stdin.isTTY)throw new Error('Owner enrollment requires a private interactive terminal.');
 stdout.write(prompt);stdin.setRawMode(true);stdin.resume();
 return new Promise<string>((resolve,reject)=>{let value='';const finish=(error?:Error)=>{stdin.removeListener('data',read);stdin.setRawMode(false);stdin.pause();stdout.write('\n');if(error)reject(error);else resolve(value)};const read=(data:Buffer)=>{for(const ch of data.toString()){if(ch==='\u0003'){finish(new Error('Enrollment cancelled.'));return}if(ch==='\r'||ch==='\n'){finish();return}if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);else if(ch>=' '&&value.length<128)value+=ch}};stdin.on('data',read)});
}
async function enroll(){
 if(process.env.NODE_ENV!=='production')throw new Error('This command is for dedicated production owner enrollment only.');
 if((await pool.query('SELECT 1 FROM users WHERE global_role IS NOT NULL')).rowCount)throw new Error('A privileged account already exists. Enrollment will not replace it.');
 stdout.write('ANIBISH owner enrollment · mail@anibish.com\nRun only through your trusted VPS SSH terminal. Password input is hidden.\n');
 const password=await hidden('New owner password (14–128 characters): ');
 if(password.length<14)throw new Error('Use at least 14 characters.');
 if(password!==await hidden('Repeat password: '))throw new Error('Passwords did not match.');
 validateNewPassword(password,{email:'mail@anibish.com',name:'Anil Bishnoi',organization:'Anibish'});
 const secret=mfaSecret();
 stdout.write('\nAdd this secret manually to your authenticator. Keep it private; it is shown only in this terminal.\n'+secret+'\n');
 let verified=false,verifiedStep=0;
 for(let attempt=0;attempt<3;attempt++)if(verifyTotp(secret,(await hidden('Authenticator code: ')).trim())){verified=true;verifiedStep=Math.floor(Date.now()/30000);break}
 if(!verified)throw new Error('Authenticator verification failed. No account was created.');
 const passwordHash=await hashNewPassword(password),encryptedSecret=encryptSecret(secret);
 await transaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(871464)');
  if((await db.query('SELECT 1 FROM users WHERE global_role IS NOT NULL')).rowCount)throw new Error('A privileged account was enrolled concurrently.');
  const [user]=(await db.query("INSERT INTO users(name,email,password_hash,verified,global_role,mfa_secret,mfa_enabled,mfa_last_step) VALUES('Anil Bishnoi','mail@anibish.com',$1,true,'super_admin',$2,true,$3) RETURNING id",[passwordHash,encryptedSecret,verifiedStep])).rows;
  const [org]=(await db.query("INSERT INTO organizations(name) VALUES('ANIBISH Studio') RETURNING id")).rows;
  await db.query("INSERT INTO memberships(user_id,org_id,role) VALUES($1,$2,'owner')",[user.id,org.id]);
  await db.query("INSERT INTO security_events(user_id,event,detail) VALUES($1,'owner.enrolled',$2)",[user.id,JSON.stringify({method:'trusted_ssh_interactive',mfa_tested:true,email_attestation:'Owner attested business contact during root enrollment; SMTP verification not claimed.'})]);
  await db.query("INSERT INTO audit_log(org_id,actor_id,action,resource) VALUES($1,$2,'owner.enrolled',$3)",[org.id,user.id,user.id]);
 });
 stdout.write('\nOwner enrolled and authenticator verified. Production portals remain closed until the remaining launch gates are verified. No password or authenticator secret is written to application logs.\n');
}
enroll().catch(e=>{console.error((e as Error).message);process.exitCode=1}).finally(()=>pool.end());
