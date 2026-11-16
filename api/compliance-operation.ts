import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {pool,transaction} from './db';
import {appendComplianceEvent,queueComplianceNotice} from './compliance';

const operation=z.enum(['backup','restore']);
const result=z.enum(['success','failed']);
// References are receipt identifiers only. Paths, URLs, addresses and credential labels are rejected.
const reference=z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).refine(value=>!/(?:password|passwd|secret|token|api[-_]?key|mfa|credential|bearer)/i.test(value));
const receipt=z.object({operation,result,reference,idempotency_key:z.string().uuid()}).strict();
type MachineResult={operation:'backup'|'restore';result:'success'|'failed';reference:string;idempotency_key:string;executed_at:string;source:'maintenance_service';verification:'reported_by_trusted_maintenance_process'};
type Receipt={record_id:string;machine_result:MachineResult;replayed:boolean};

/** Trusted maintenance CLI only. This records a result; it does not execute or independently verify a backup/restore. */
export async function recordComplianceOperation(op:'backup'|'restore',outcome:'success'|'failed',safeReference:string,idempotencyKey:string):Promise<Receipt>{
 const parsed=receipt.safeParse({operation:op,result:outcome,reference:safeReference,idempotency_key:idempotencyKey});
 if(!parsed.success)throw new Error('Invalid operation receipt. Use an operation, result, nonsecret identifier and UUID.');
 const b=parsed.data;
 return transaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(871480)');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['maintenance-receipt:'+b.idempotency_key]);
  const prior=(await db.query("SELECT record_id,envelope->'detail'->'machine_result' AS machine_result FROM compliance_events WHERE event='operation.recorded' AND envelope->'detail'->'machine_result'->>'idempotency_key'=$1 ORDER BY id LIMIT 1",[b.idempotency_key])).rows[0] as {record_id:string;machine_result:MachineResult}|undefined;
  if(prior){if(prior.machine_result.operation!==b.operation||prior.machine_result.result!==b.result||prior.machine_result.reference!==b.reference)throw new Error('This operation receipt UUID already belongs to different content.');return {record_id:prior.record_id,machine_result:prior.machine_result,replayed:true};}
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['maintenance-operation:'+b.operation]);
  const externalKey='operation:'+b.operation;
  const before=(await db.query('SELECT * FROM compliance_records WHERE external_key=$1 FOR UPDATE',[externalKey])).rows[0];
  if(before&&(before.kind!=='evidence'||before.data===null||Array.isArray(before.data)||typeof before.data!=='object'))throw new Error('The operation evidence record requires owner review before it can be updated.');
  const machine:MachineResult={...b,executed_at:new Date().toISOString(),source:'maintenance_service',verification:'reported_by_trusted_maintenance_process'};
  const saved=before?(await db.query("UPDATE compliance_records SET data=jsonb_set(data,'{machine_result}',$1::jsonb,true),revision=revision+1,updated_by=NULL,updated_at=now() WHERE id=$2 RETURNING *",[JSON.stringify(machine),before.id])).rows[0]:(await db.query("INSERT INTO compliance_records(id,external_key,kind,title,status,data,created_by,updated_by) VALUES($1,$2,'evidence',$3,'not_assessed',$4,NULL,NULL) RETURNING *",[randomUUID(),externalKey,b.operation==='backup'?'Backup operation receipts':'Restore operation receipts',JSON.stringify({machine_result:machine})])).rows[0];
  await appendComplianceEvent(db,null,'operation.recorded',saved.id,{source:'maintenance_service',before:before||null,snapshot:saved,machine_result:machine,note:'Result reported by the trusted maintenance process. No human approval, recovery guarantee or independent compliance assessment is asserted.'});
  if(b.result==='failed')await queueComplianceNotice(db,'maintenance_failure',saved.id,'A maintenance operation reported a failure. Review the private compliance evidence.','maintenance-failure:'+b.idempotency_key);
  return {record_id:saved.id,machine_result:machine,replayed:false};
 });
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2);
 try{if(args.length!==4)throw new Error('Invalid receipt arguments.');await recordComplianceOperation(args[0] as 'backup'|'restore',args[1] as 'success'|'failed',args[2],args[3]);console.log('Maintenance result recorded.');}
 catch{console.error('COMPLIANCE_OPERATION_NOT_RECORDED');process.exitCode=1;}
 finally{await pool.end();}
}
