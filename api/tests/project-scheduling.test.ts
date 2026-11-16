import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../server';
import {pool} from '../db';
import {migrate} from '../migrate';
import {totp} from '../security';

let app:Awaited<ReturnType<typeof buildServer>>;
const suffix=randomUUID().slice(0,8),password='Isolated-planning-'+randomUUID();
const ip='127.37.'+parseInt(suffix.slice(0,2),16)+'.'+parseInt(suffix.slice(2,4),16);
const headers={'x-studio-client':'web',origin:'http://localhost:3000'};
async function call(method:'GET'|'POST'|'PATCH',url:string,body:unknown={},cookie=''){
 return app.inject({method,url,remoteAddress:ip,headers:{...headers,'content-type':'application/json',...(cookie?{cookie}:{})},...(method==='GET'?{}:{payload:JSON.stringify(body)})});
}
async function account(name:string){
 const email=`planning-${name}-${suffix}@example.test`;
 const created=await call('POST','/auth/register',{name,email,password,organization:'Isolated planning '+name});assert.equal(created.statusCode,201,created.body);
 const token=new URL('http://localhost'+created.json().development_link).searchParams.get('token');assert.equal((await call('POST','/auth/token',{token})).statusCode,200);
 const login=await call('POST','/auth/login',{email,password});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']),user=(await call('GET','/auth/me',{},cookie)).json().user;return {cookie,user};
}
let owner:Awaited<ReturnType<typeof account>>,one:typeof owner,two:typeof owner,noMfa:typeof owner;
const migrationBefore=new Map<string,{due_date:string|null}>();
before(async()=>{
 if(!process.env.DATABASE_URL?.includes('anibish_qa'))throw Error('Scheduling tests require the dedicated anibish_qa database.');
 if((await pool.query("SELECT to_regclass('tasks') AS present")).rows[0].present)for(const t of(await pool.query("SELECT id,to_char(due_date,'YYYY-MM-DD') AS due_date FROM tasks")).rows)migrationBefore.set(t.id,t);
 await migrate();app=await buildServer();owner=await account('owner');one=await account('one');two=await account('two');noMfa=await account('no-mfa');
 for(const a of[owner,noMfa])await pool.query("UPDATE users SET global_role='super_admin' WHERE id=$1",[a.user.id]);
 const setup=(await call('POST','/auth/mfa/setup',{},owner.cookie)).json();assert.equal((await call('POST','/auth/mfa/verify',{code:totp(setup.secret)},owner.cookie)).statusCode,200);
});
after(async()=>{await app?.close();await pool.end();});
async function project(org=one.user.org_id){const r=await call('POST','/projects',{title:'Scheduling QA '+randomUUID(),org_id:org,due_date:'2035-12-31'},owner.cookie);assert.equal(r.statusCode,200,r.body);return r.json();}
async function task(projectId:string,title:string,extra:Record<string,unknown>={}){const r=await call('POST','/tasks',{project_id:projectId,title,...extra},owner.cookie);assert.equal(r.statusCode,200,r.body);return r.json();}
async function schedule(projectId:string,cookie=owner.cookie){const r=await call('GET','/projects/'+projectId+'/schedule',{},cookie);assert.equal(r.statusCode,200,r.body);return r.json();}
const dates=(start:string|null,end:string|null,revision=1)=>({start_date:start,due_date:end,expected_revision:revision,reason:'Explicit isolated planning decision.'});

test('migration retains existing task target dates without fabricating prior schedule history',async()=>{
 for(const [id,old]of migrationBefore){const current=(await pool.query("SELECT to_char(due_date,'YYYY-MM-DD') AS due_date FROM tasks WHERE id=$1",[id])).rows[0];assert.equal(current.due_date,old.due_date);}
});

test('task planning dates persist, preserve date-only values and leave other commitments unchanged',async()=>{
 const p=await project(),t=await task(p.id,'Persisted calendar task');
 const m=(await call('POST','/milestones',{project_id:p.id,title:'Existing agreed milestone',due_date:'2035-11-30'},owner.cookie)).json();
 const beforeProject=(await pool.query('SELECT * FROM projects WHERE id=$1',[p.id])).rows[0];
 const beforeMilestone=(await pool.query('SELECT * FROM milestones WHERE id=$1',[m.id])).rows[0];
 const saved=await call('PATCH','/tasks/'+t.id+'/schedule',dates('2031-04-03','2031-04-09'),owner.cookie);assert.equal(saved.statusCode,200,saved.body);
 assert.equal(saved.json().task.start_date,'2031-04-03');assert.equal(saved.json().task.due_date,'2031-04-09');assert.equal(saved.json().task.schedule_revision,2);
 const plan=await schedule(p.id);assert.equal(plan.as_of_timezone,'Asia/Kolkata');assert.equal(plan.as_of,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));const fresh=plan.tasks.find((r:{id:string})=>r.id===t.id);assert.equal(fresh.start_date,'2031-04-03');assert.equal(fresh.due_date,'2031-04-09');assert.equal(fresh.schedule_revision,2);
 assert.deepEqual((await pool.query('SELECT * FROM projects WHERE id=$1',[p.id])).rows[0],beforeProject);
 assert.deepEqual((await pool.query('SELECT * FROM milestones WHERE id=$1',[m.id])).rows[0],beforeMilestone);
 const h=(await pool.query("SELECT * FROM project_history WHERE project_id=$1 AND event='task.schedule_updated' ORDER BY id DESC",[p.id])).rows[0];
 assert.equal(h.actor_id,owner.user.id);assert.deepEqual(h.detail.before,{start_date:null,due_date:null});assert.deepEqual(h.detail.after,{start_date:'2031-04-03',due_date:'2031-04-09'});assert.equal(h.detail.internal,true);assert.equal(h.detail.reason,dates(null,null).reason);
});

test('simultaneous date writes use the persisted revision and retain authoritative history',async()=>{
 const p=await project(),t=await task(p.id,'Concurrent task');
 const writes=await Promise.all([call('PATCH','/tasks/'+t.id+'/schedule',dates('2031-05-01','2031-05-02'),owner.cookie),call('PATCH','/tasks/'+t.id+'/schedule',dates('2031-05-03','2031-05-04'),owner.cookie)]);
 assert.deepEqual(writes.map(r=>r.statusCode).sort(),[200,409]);
 const row=(await schedule(p.id)).tasks[0];assert.equal(row.schedule_revision,2);
 const h=(await pool.query("SELECT * FROM project_history WHERE project_id=$1 AND event='task.schedule_updated'",[p.id])).rows;assert.equal(h.length,1);assert.equal(h[0].detail.after.start_date,row.start_date);
 const duplicate=await call('PATCH','/tasks/'+t.id+'/schedule',dates('2031-05-01','2031-05-02'),owner.cookie);assert.equal(duplicate.statusCode,409);
});

test('legacy task due-date edits also increment revisions and preserve actual before/after history',async()=>{
 const p=await project(),t=await task(p.id,'Legacy task date flow');
 assert.equal((await call('PATCH','/tasks/'+t.id+'/schedule',dates('2031-03-01','2031-03-02'),owner.cookie)).statusCode,200);
 const legacy=await call('PATCH','/tasks/'+t.id,{due_date:'2031-03-08'},owner.cookie);assert.equal(legacy.statusCode,200,legacy.body);
 const current=(await schedule(p.id)).tasks[0];assert.equal(current.schedule_revision,3);assert.equal(current.due_date,'2031-03-08');
 const h=(await pool.query("SELECT * FROM project_history WHERE project_id=$1 AND event='task.schedule_updated' ORDER BY id",[p.id])).rows;
 assert.equal(h.length,2);assert.equal(h[1].detail.before.due_date,'2031-03-02');assert.equal(h[1].detail.after.due_date,'2031-03-08');assert.equal(h[1].actor_id,null);assert.equal(h[1].detail.source,'task_date_update');assert.notEqual(h[1].detail.reason,h[0].detail.reason);
 assert.equal((await call('PATCH','/tasks/'+t.id+'/schedule',dates(null,'2031-03-09',2),owner.cookie)).statusCode,409);
});

test('real calendar dates, date order, required rationale and immutable fields are validated',async()=>{
 const p=await project(),t=await task(p.id,'Date validation');
 for(const body of[dates('2031-02-30','2031-03-01'),dates('2031-05-10','2031-05-01'),{...dates(null,null),reason:'short'},{...dates(null,null),org_id:two.user.org_id}])assert.equal((await call('PATCH','/tasks/'+t.id+'/schedule',body,owner.cookie)).statusCode,400);
 assert.equal((await schedule(p.id)).tasks[0].schedule_revision,1);
 assert.equal((await call('PATCH','/tasks/'+t.id+'/schedule',dates('2031-02-28','2031-03-01'),owner.cookie)).statusCode,200);
 assert.equal((await call('PATCH','/tasks/'+t.id,{due_date:'2031-02-27'},owner.cookie)).statusCode,400);
 assert.equal((await schedule(p.id)).tasks[0].schedule_revision,2);
});

test('dependency risks are advisory, overdue excludes done work, and dates never reschedule prerequisites',async()=>{
 const p=await project(),prerequisite=await task(p.id,'Prerequisite',{due_date:'2031-06-10'}),dependent=await task(p.id,'Dependent');
 assert.equal((await call('POST','/tasks/'+dependent.id+'/dependencies',{depends_on:prerequisite.id},owner.cookie)).statusCode,200);
 const saved=await call('PATCH','/tasks/'+dependent.id+'/schedule',dates('2031-06-01','2031-06-05'),owner.cookie);assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().warnings.length,1);
 const late=await task(p.id,'Unfinished overdue',{due_date:'2000-01-01'}),done=await task(p.id,'Done old target',{due_date:'2000-01-01',status:'done'});
 const view=await schedule(p.id);assert.equal(view.tasks.find((t:{id:string})=>t.id===late.id).overdue,true);assert.equal(view.tasks.find((t:{id:string})=>t.id===done.id).overdue,false);assert.equal(view.tasks.find((t:{id:string})=>t.id===dependent.id).dependency_warnings.length,1);assert.equal(view.tasks.find((t:{id:string})=>t.id===prerequisite.id).due_date,'2031-06-10');
});

test('customer schedule contains no hidden task or prerequisite information and keeps rationale private',async()=>{
 const p=await project(),visible=await task(p.id,'Shared scheduled task'),hidden=await task(p.id,'SECRET INTERNAL PREREQUISITE '+suffix,{internal:true,due_date:'2099-12-31'});
 assert.equal((await call('POST','/tasks/'+visible.id+'/dependencies',{depends_on:hidden.id},owner.cookie)).statusCode,200);
 const reason='PRIVATE STUDIO PLANNING RATIONALE '+suffix;
 assert.equal((await call('PATCH','/tasks/'+visible.id+'/schedule',{...dates('2031-06-01','2031-06-02'),reason},owner.cookie)).statusCode,200);
 assert.equal((await schedule(p.id)).summary.dependency_risks,1);
 const shared=await call('GET','/projects/'+p.id+'/schedule',{},one.cookie);assert.equal(shared.statusCode,200,shared.body);
 for(const secret of[hidden.id,hidden.title,'2099-12-31',reason])assert.ok(!shared.body.includes(secret));
 assert.equal(shared.json().summary.total,1);assert.equal(shared.json().summary.dependency_risks,0);assert.equal(shared.json().tasks[0].pending_visible_dependencies,0);assert.deepEqual(shared.json().tasks[0].dependency_warnings,[]);
 const activity=await call('GET','/projects/'+p.id+'/activity',{},one.cookie);assert.equal(activity.statusCode,200);assert.ok(!activity.body.includes(reason));assert.ok(!activity.body.includes('task.schedule_updated'));
});

test('schedule permissions enforce tenant isolation, staff MFA and internal-only date editing',async()=>{
 const p=await project(),t=await task(p.id,'Scoped schedule task');
 assert.equal((await call('GET','/projects/'+p.id+'/schedule')).statusCode,401);
 assert.equal((await call('GET','/projects/'+p.id+'/schedule',{},two.cookie)).statusCode,404);
 assert.equal((await call('GET','/projects/'+p.id+'/schedule',{},noMfa.cookie)).statusCode,403);
 for(const cookie of[one.cookie,two.cookie,noMfa.cookie])assert.equal((await call('PATCH','/tasks/'+t.id+'/schedule',dates(null,'2031-05-01'),cookie)).statusCode,403);
 assert.equal((await schedule(p.id)).tasks[0].schedule_revision,1);
});

test('clearing dates is explicit and a repeated unchanged save adds no false date history',async()=>{
 const p=await project(),t=await task(p.id,'Clear planning dates');
 assert.equal((await call('PATCH','/tasks/'+t.id+'/schedule',dates('2031-04-01','2031-04-02'),owner.cookie)).statusCode,200);
 assert.equal((await call('PATCH','/tasks/'+t.id+'/schedule',dates(null,null,2),owner.cookie)).statusCode,200);
 const unchanged=await call('PATCH','/tasks/'+t.id+'/schedule',dates(null,null,3),owner.cookie);assert.equal(unchanged.statusCode,200,unchanged.body);assert.equal(unchanged.json().task.schedule_revision,3);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM project_history WHERE project_id=$1 AND event='task.schedule_updated'",[p.id])).rows[0].n,2);
 assert.equal((await schedule(p.id)).summary.unscheduled,1);
});
