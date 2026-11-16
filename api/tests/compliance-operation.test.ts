import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pool} from '../db';
import {migrate} from '../migrate';
import {recordComplianceOperation} from '../compliance-operation';
let ownerId:string;
before(async()=>{
 const target=new URL(process.env.DATABASE_URL||'postgresql://invalid');if(!['127.0.0.1','localhost'].includes(target.hostname)||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(target.pathname))throw Error('Maintenance receipt tests require a dedicated local anibish_qa database.');
 await migrate();ownerId=(await pool.query("INSERT INTO users(name,email,password_hash,verified,global_role,mfa_enabled) VALUES('Synthetic maintenance owner',$1,'not-a-login-password',true,'super_admin',true) RETURNING id",['maintenance-'+randomUUID()+'@example.test'])).rows[0].id;
});
after(async()=>{await pool.end()});

test('maintenance result is a service-attributed receipt, not a human compliance approval',async()=>{
 const prior=(await pool.query("SELECT * FROM compliance_records WHERE external_key='operation:backup'")).rows[0];const result=await recordComplianceOperation('backup','success','anibish-backup-'+randomUUID(),randomUUID());assert.equal(result.replayed,false);assert.equal(result.machine_result.result,'success');assert.equal(result.machine_result.source,'maintenance_service');assert.equal(result.machine_result.verification,'reported_by_trusted_maintenance_process');assert.ok(Math.abs(Date.now()-new Date(result.machine_result.executed_at).getTime())<5000);
 const row=(await pool.query('SELECT * FROM compliance_records WHERE id=$1',[result.record_id])).rows[0];assert.equal(row.external_key,'operation:backup');assert.equal(row.kind,'evidence');assert.equal(row.status,prior?.status||'not_assessed');assert.equal(row.created_by,prior?.created_by||null);assert.equal(row.updated_by,null);
 const event=(await pool.query("SELECT * FROM compliance_events WHERE record_id=$1 AND event='operation.recorded' ORDER BY id DESC LIMIT 1",[result.record_id])).rows[0];assert.equal(event.actor_id,null);assert.equal(event.envelope.actor_id,null);assert.equal(event.envelope.detail.source,'maintenance_service');assert.match(event.envelope.detail.note,/No human approval/);
});

test('later operation results preserve owner fields, title, status and immutable historical snapshots',async()=>{
 const before=(await pool.query("SELECT * FROM compliance_records WHERE external_key='operation:backup'")).rows[0];
 await pool.query("UPDATE compliance_records SET title='Owner reviewed backup evidence',status='partial',data=data||$1::jsonb,updated_by=$2 WHERE id=$3",[JSON.stringify({owner_note:'Preserve this owner assessment.',evidence:['owner-private-reference'],review_date:'2027-01-01'}),ownerId,before.id]);
 const result=await recordComplianceOperation('backup','failed','backup-receipt-'+randomUUID(),randomUUID()),after=(await pool.query('SELECT * FROM compliance_records WHERE id=$1',[before.id])).rows[0];assert.equal(result.record_id,before.id);assert.equal(after.title,'Owner reviewed backup evidence');assert.equal(after.status,'partial');assert.equal(after.data.owner_note,'Preserve this owner assessment.');assert.deepEqual(after.data.evidence,['owner-private-reference']);assert.equal(after.data.review_date,'2027-01-01');assert.equal(after.data.machine_result.result,'failed');assert.equal(after.revision,before.revision+1);
 const events=(await pool.query("SELECT * FROM compliance_events WHERE record_id=$1 AND event='operation.recorded' ORDER BY id",[before.id])).rows;assert.ok(events.length>=2);assert.equal(events[0].envelope.detail.machine_result.result,'success');assert.equal(events.at(-1).envelope.detail.before.data.owner_note,'Preserve this owner assessment.');assert.equal(events.at(-1).actor_id,null);
 await assert.rejects(pool.query("UPDATE compliance_events SET event='rewritten' WHERE id=$1",[events[0].id]),/append-only/i);
});

test('one UUID is idempotent across simultaneous and restarted calls and rejects changed receipt content',async()=>{
 const key=randomUUID(),ref='restore-check-'+randomUUID();const results=await Promise.all([recordComplianceOperation('restore','success',ref,key),recordComplianceOperation('restore','success',ref,key)]);assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);assert.equal(results[0].record_id,results[1].record_id);assert.equal(results[0].machine_result.executed_at,results[1].machine_result.executed_at);
 const persisted=(await pool.query('SELECT data FROM compliance_records WHERE id=$1',[results[0].record_id])).rows[0].data.machine_result;assert.equal(persisted.idempotency_key,key);const cli=await promisify(execFile)(process.execPath,['--import','tsx','api/compliance-operation.ts','restore','success',ref,key],{cwd:process.cwd(),env:process.env,maxBuffer:4096});assert.match(cli.stdout,/Maintenance result recorded/);assert.ok(!cli.stdout.includes(ref));const retry=await recordComplianceOperation('restore','success',ref,key);assert.equal(retry.replayed,true);assert.deepEqual(retry.machine_result,persisted);
 const count=(await pool.query("SELECT count(*)::int AS n FROM compliance_events WHERE event='operation.recorded' AND envelope->'detail'->'machine_result'->>'idempotency_key'=$1",[key])).rows[0].n;assert.equal(count,1);
 for(const args of [['restore','failed',ref],['restore','success','different-reference'],['backup','success',ref]]as const)await assert.rejects(recordComplianceOperation(args[0],args[1],args[2],key),/already belongs to different content/);
});

test('failed receipt emits one generic deduplicated owner notice without the private reference or raw diagnostic payload',async()=>{
 const key=randomUUID(),ref='private-receipt-'+randomUUID();await recordComplianceOperation('restore','failed',ref,key);await recordComplianceOperation('restore','failed',ref,key);
 const notices=(await pool.query('SELECT * FROM compliance_notices WHERE dedupe_key=$1',['maintenance-failure:'+key])).rows;assert.equal(notices.length,1);assert.ok(!JSON.stringify(notices).includes(ref));
 const jobs=(await pool.query('SELECT * FROM outbox WHERE dedupe_key LIKE $1',['compliance:'+notices[0].id+':%'])).rows;assert.ok(jobs.some(j=>j.recipient.endsWith('@example.test')));assert.ok(jobs.every(j=>j.template==='compliance_alert'));assert.ok(!JSON.stringify(jobs).includes(ref));assert.ok(!JSON.stringify(jobs).includes('password_hash'));
});

test('unsafe references, unsupported outcomes and malformed UUIDs fail before writing any evidence',async()=>{
 const before=Number((await pool.query('SELECT count(*) AS n FROM compliance_events')).rows[0].n);
 for(const ref of ['/private/backups/archive.gpg','https://private.example/x','person@example.test','password=sample','mfa-secret','line\nbreak','x'.repeat(121),''])await assert.rejects(recordComplianceOperation('backup','success',ref,randomUUID()),/Invalid operation receipt/);
 await assert.rejects(recordComplianceOperation('backup','success','safe-reference','not-a-uuid'),/Invalid operation receipt/);
 await assert.rejects(recordComplianceOperation('unsupported' as 'backup','success','safe-reference',randomUUID()),/Invalid operation receipt/);
 await assert.rejects(recordComplianceOperation('backup','unverified' as 'success','safe-reference',randomUUID()),/Invalid operation receipt/);
 assert.equal(Number((await pool.query('SELECT count(*) AS n FROM compliance_events')).rows[0].n),before);
});
