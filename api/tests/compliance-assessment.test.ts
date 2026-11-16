import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool} from '../db';
import {migrate} from '../migrate';
import {assessInitialControls} from '../compliance-assessment';
const suffix=String(Math.floor(Math.random()*1000000)),key='asvs-5.0.0-V99.1.'+suffix;
const data={requirement_id:'V99.1.'+suffix,standard:'OWASP ASVS',version:'5.0.0',requirement:'Synthetic isolated assessment fixture, not a real standard requirement.',license:'Synthetic QA',evidence:[]};
const payload={records:[{external_key:key,expected_revision:1 as const,status:'partial' as const,data:{...data,finding:'Synthetic source assessment only'},assessment_note:'Synthetic isolated QA evidence; no approval.'}]};
before(async()=>{if(!process.env.DATABASE_URL||!/^\/anibish_qa(?:_[a-z0-9_]+)?$/.test(new URL(process.env.DATABASE_URL).pathname))throw Error('Dedicated QA database required.');await migrate();await pool.query("INSERT INTO compliance_records(id,external_key,kind,title,status,data) VALUES($1,$2,'asvs','Synthetic assessment fixture','not_assessed',$3)",[randomUUID(),key,JSON.stringify(data)]);});
after(async()=>{await pool.end()});
test('initial assessment dry run never changes controls, apply is idempotent and retains immutable standard evidence',async()=>{
 assert.equal((await assessInitialControls(payload)).eligible,1);assert.equal((await pool.query('SELECT revision FROM compliance_records WHERE external_key=$1',[key])).rows[0].revision,1);
 await assert.rejects(assessInitialControls({records:[{...payload.records[0],data:{...payload.records[0].data,requirement:'tampered'}}]},true),/provenance/);
 const applied=await assessInitialControls(payload,true);assert.equal(applied.eligible,1);assert.equal((await assessInitialControls(payload,true)).unchanged,1);
 const row=(await pool.query('SELECT * FROM compliance_records WHERE external_key=$1',[key])).rows[0];assert.equal(row.revision,2);assert.equal(row.data.requirement,data.requirement);
 const events=(await pool.query("SELECT * FROM compliance_events WHERE record_id=$1 AND event='control.initial_assessment'",[row.id])).rows;assert.equal(events.length,1);assert.equal(events[0].actor_id,null);assert.match(events[0].envelope.detail.assurance,/No owner\/legal approval/);
});
test('initial assessment never overwrites later owner edits, later assessments, duplicate IDs or approval statuses',async()=>{
 const edited=structuredClone(payload);edited.records[0].data.finding='Changed evidence must preserve an edited control';assert.equal((await assessInitialControls(edited,true)).owner_or_later_changes_preserved,1);
 await assert.rejects(assessInitialControls({records:[payload.records[0],payload.records[0]]},true),/Duplicate/);
 await assert.rejects(assessInitialControls({records:[{...payload.records[0],status:'approved'}]},true));
});
