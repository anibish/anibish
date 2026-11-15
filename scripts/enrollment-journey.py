# Local regression check: requires PostgreSQL on loopback 54368 with the development anibish role.
# Uses and drops only a uniquely named temporary QA database. Never targets production.
import os,pty,select,subprocess,time,secrets,base64,hmac,hashlib,struct,json
name='anibish_enrollment_qa_'+secrets.token_hex(5)
base='postgresql://anibish@127.0.0.1:54368/'
env=dict(os.environ,DATABASE_URL=base+name,NODE_ENV='production',MFA_ENCRYPTION_KEY=secrets.token_hex(32))
query="import pg from 'pg';let p=new pg.Pool({connectionString:process.env.DATABASE_URL});await p.query(process.env.QA_SQL);await p.end()"
def sql(command,database='postgres'):
 e=dict(env,DATABASE_URL=base+database,QA_SQL=command)
 return subprocess.run(['node','--input-type=module','-e',query],env=e,capture_output=True,check=True)
master=None;proc=None
try:
 sql('CREATE DATABASE '+name)
 subprocess.run(['node','--import','tsx','api/migrate.ts'],env=env,capture_output=True,check=True)
 master,slave=pty.openpty();proc=subprocess.Popen(['node','--import','tsx','api/enroll-owner.ts'],env=env,stdin=slave,stdout=slave,stderr=slave);os.close(slave)
 password='QA-'+secrets.token_urlsafe(24)
 output='';step=0;deadline=time.time()+25
 while time.time()<deadline and proc.poll() is None:
  if select.select([master],[],[],.1)[0]:
   try:output+=os.read(master,65536).decode(errors='replace')
   except OSError:break
  if step==0 and 'New owner password' in output:os.write(master,(password+'\r').encode());step=1;output=''
  elif step==1 and 'Repeat password:' in output:os.write(master,(password+'\r').encode());step=2;output=''
  elif step==2 and 'Authenticator code:' in output:
   import re
   secret=re.search(r'\b[A-Z2-7]{32}\b',output).group()
   digest=hmac.new(base64.b32decode(secret),struct.pack('>Q',int(time.time())//30),hashlib.sha1).digest();offset=digest[-1]&15
   code=str((struct.unpack('>I',digest[offset:offset+4])[0]&0x7fffffff)%1000000).zfill(6)
   os.write(master,(code+'\r').encode());step=3;output=''
 if proc.poll() is None:proc.terminate();raise RuntimeError('Enrollment PTY test timed out at prompt stage '+str(step))
 assert proc.returncode==0,'Enrollment failed; secrets suppressed. Final error: '+output.splitlines()[-1][:200]
 sql("DO $$ BEGIN IF (SELECT count(*) FROM users WHERE global_role='super_admin' AND mfa_enabled AND verified)<>1 OR (SELECT count(*) FROM audit_log WHERE action='owner.enrolled')<>1 OR (SELECT count(*) FROM security_events WHERE event='owner.enrolled' AND detail->>'mfa_tested'='true')<>1 THEN RAISE EXCEPTION 'Missing enrollment records';END IF;END $$;",name)
 print(json.dumps({'private_interactive_owner_enrollment':'PASS','password_and_totp_prompts_completed':True,'production_touched':False}))
finally:
 if proc and proc.poll() is None:proc.terminate();proc.wait()
 if master:os.close(master)
 sql('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)')
