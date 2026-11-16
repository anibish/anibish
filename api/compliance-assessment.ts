import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {pool,transaction} from './db';
import {appendComplianceEvent} from './compliance';

const item=z.object({external_key:z.string().regex(/^asvs-5\.0\.0-V\d+\.\d+\.\d+$/),expected_revision:z.literal(1),status:z.enum(['implemented','tested','partial','not_implemented','not_applicable','awaiting_external_evidence','not_assessed']),data:z.record(z.string(),z.unknown()),assessment_note:z.string().min(10).max(5000)}).strict();
const batch=z.object({records:z.array(item).min(1).max(345)}).strict();
const immutable=['requirement_id','standard','version','level','chapter_id','chapter','section_id','section','requirement','source_url','source_file_sha256','license','license_url','attribution','attribution_source'];
export async function assessInitialControls(input:unknown,apply=false){
 const b=batch.parse(input);if(new Set(b.records.map(r=>r.external_key)).size!==b.records.length)throw Error('Duplicate control identifiers.');
 for(const r of b.records){if(JSON.stringify(r.data).length>180000)throw Error('Assessment data exceeds its bound.');if(['tested','not_applicable'].includes(r.status)&&(!Array.isArray(r.data.evidence)||!r.data.evidence.length))throw Error('Explicit scoped evidence is required.');}
 return transaction(async db=>{
  await db.query('SELECT pg_advisory_xact_lock(871480)');
  let eligible=0,unchanged=0,preserved=0;
  for(const r of b.records){
   const before=(await db.query("SELECT * FROM compliance_records WHERE external_key=$1 AND kind='asvs' FOR UPDATE",[r.external_key])).rows[0];
   if(!before)throw Error('An initial source control is missing; no rows were changed.');
   for(const key of immutable)if(JSON.stringify(before.data[key])!==JSON.stringify(r.data[key]))throw Error('Official requirement provenance must remain unchanged.');
   if(before.status===r.status&&JSON.stringify(sort(before.data))===JSON.stringify(sort(r.data))){unchanged++;continue;}
   if(before.revision!==1||before.status!=='not_assessed'){preserved++;continue;}
   eligible++;
   if(apply){const saved=(await db.query('UPDATE compliance_records SET status=$1,data=$2,revision=revision+1,updated_by=NULL,updated_at=now() WHERE id=$3 RETURNING *',[r.status,JSON.stringify(r.data),before.id])).rows[0];await appendComplianceEvent(db,null,'control.initial_assessment',before.id,{source:'trusted_initial_assessment',before,snapshot:saved,note:r.assessment_note,assurance:'Assistant source/evidence assessment only. No owner/legal approval, independent assessment, certification or full-standard pass is asserted.'});}
  }
  return {mode:apply?'applied':'dry_run',records:b.records.length,eligible,unchanged,owner_or_later_changes_preserved:preserved};
 });
}
function sort(v:unknown):unknown{return v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(sort):Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,sort(value)]));}
// Maintenance CLI, deliberately no HTTP endpoint. Inputs are private evidence files.
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{if(process.argv.length!==4||!['--dry-run','--apply'].includes(process.argv[3]))throw Error('Expected a private assessment file and explicit mode.');console.log(JSON.stringify(await assessInitialControls(JSON.parse(await readFile(process.argv[2],'utf8')),process.argv[3]==='--apply')));}catch{console.error('INITIAL_CONTROL_ASSESSMENT_NOT_APPLIED');process.exitCode=1;}finally{await pool.end();}}
