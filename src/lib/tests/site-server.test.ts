import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchPublishedSite,SiteUnavailableError} from '../site-server';
const project={slug:'portfolio/10learn',title:'10learn — verified fixture',kind:'portfolio',content:{body:'Current published project.'},seo:{title:'10learn',canonical:'https://anibish.com/portfolio/10learn'}};
const site={pages:[project],features:{admin:true,customer:false},services:[{slug:'engineering',title:'Engineering',category:'Software',description:'Verified public service.',pricing_model:'quote',data:{}}],redirects:[{source:'/old',destination:'/portfolio',status:301}]};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const noWait=async()=>{};
function stub(run:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>){return run as typeof fetch}

test('validated published content is read without credentials or persistent cache',async()=>{
 const calls:RequestInit[]=[];const result=await fetchPublishedSite({fetcher:stub(async(_url,init)=>{calls.push(init!);return json({...site,private_debug:'must not cross public contract'})})});
 assert.deepEqual(result,site);assert.equal(calls.length,1);assert.equal(calls[0].cache,'no-store');assert.equal(calls[0].credentials,'omit');assert.equal(calls[0].redirect,'error');assert.ok(calls[0].signal);const headers=new Headers(calls[0].headers);assert.equal(headers.has('authorization'),false);assert.equal(headers.has('cookie'),false);
});
test('an authoritative HTTP200 empty publication is valid and never retried',async()=>{
 let calls=0;assert.deepEqual(await fetchPublishedSite({fetcher:stub(async()=>{calls++;return json({pages:[],services:[]})})}),{pages:[],services:[]});assert.equal(calls,1);
});
test('transient503 retries once with a fresh signal and recovers current published data',async()=>{
 const signals:AbortSignal[]=[];const waits:number[]=[];let calls=0;const result=await fetchPublishedSite({fetcher:stub(async(_url,init)=>{signals.push(init!.signal!);return ++calls===1?json({error:'upstream'},503):json(site)}),wait:async ms=>{waits.push(ms)}});
 assert.deepEqual(result,site);assert.equal(calls,2);assert.notEqual(signals[0],signals[1]);assert.deepEqual(waits,[200]);
});
test('repeated5xx has a finite budget and throws typed unavailability without fabricated empty content',async()=>{
 let calls=0;await assert.rejects(fetchPublishedSite({fetcher:stub(async()=>{calls++;return json({private:'never displayed'},502)}),wait:noWait}),e=>e instanceof SiteUnavailableError&&e.kind==='upstream'&&e.attempts===2&&e.status===502);assert.equal(calls,2);
});
test('actual abort deadlines are retried only within the bounded attempt count',async()=>{
 let calls=0;const started=Date.now();await assert.rejects(fetchPublishedSite({deadlineMs:8,wait:noWait,fetcher:stub(async(_url,init)=>{calls++;return new Promise((_resolve,reject)=>{
  const signal=init!.signal!;
  const aborted=()=>{clearTimeout(guard);reject(signal.reason)};
  // Real fetch has an active socket. This bounded referenced timer models that handle;
  // AbortSignal.timeout alone is unreferenced and cannot keep this isolated stub alive.
  const guard=setTimeout(()=>{signal.removeEventListener('abort',aborted);reject(new Error('Fixture did not observe the abort deadline.'))},250);
  signal.addEventListener('abort',aborted,{once:true});if(signal.aborted)aborted();
 })})}),e=>e instanceof SiteUnavailableError&&e.kind==='timeout'&&e.attempts===2);assert.equal(calls,2);assert.ok(Date.now()-started<1000);
});
test('network errors are retried without copying internal connection details into thrown errors',async()=>{
 let calls=0;await assert.rejects(fetchPublishedSite({wait:noWait,fetcher:stub(async()=>{calls++;throw new TypeError('sensitive-internal-origin-and-credential-fixture')})}),e=>{assert.ok(e instanceof SiteUnavailableError);assert.equal(e.kind,'network');assert.equal(e.attempts,2);assert.equal(String(e).includes('sensitive-internal'),false);assert.equal('cause'in e,false);return true});assert.equal(calls,2);
});
test('permanent4xx and rate limiting fail once instead of masking rejection with retries',async()=>{
 for(const status of [400,401,403,404,429]){let calls=0;await assert.rejects(fetchPublishedSite({wait:noWait,fetcher:stub(async()=>{calls++;return json({error:'not public data'},status)})}),e=>e instanceof SiteUnavailableError&&e.status===status&&e.attempts===1&&e.kind===(status===429?'rate_limited':'http'));assert.equal(calls,1)}
});
test('malformedJSON and malformed public shapes fail explicitly without returning empty collections',async()=>{
 const malformed=[null,{}, {pages:{}},{pages:[{...project,seo:{noindex:'wrong'}}]}, {pages:[{...project,content:{body:{private:'bad'}}}]},{pages:[],services:[{}]},{pages:[],features:{admin:'wrong',customer:false}},{pages:[],redirects:[{source:'/',destination:'/',status:999}]},{pages:[],error:'not valid content'}];
 for(const body of malformed){let calls=0;await assert.rejects(fetchPublishedSite({wait:noWait,fetcher:stub(async()=>{calls++;return json(body)})}),e=>e instanceof SiteUnavailableError&&e.kind==='invalid_response'&&e.attempts===1);assert.equal(calls,1)}
 await assert.rejects(fetchPublishedSite({fetcher:stub(async()=>new Response('{broken json',{status:200}))}),e=>e instanceof SiteUnavailableError&&e.kind==='invalid_response');
});
test('a broken response stream retries and recovers without exposing partial content',async()=>{
 let calls=0;const result=await fetchPublishedSite({wait:noWait,fetcher:stub(async()=>++calls===1?new Response(new ReadableStream({start(controller){controller.error(new TypeError('connection interrupted'))}})):json(site))});assert.equal(calls,2);assert.deepEqual(result,site);
});
test('a new request cannot reuse a previous successful snapshot after publication is revoked',async()=>{
 let calls=0;const fetcher=stub(async()=>++calls===1?json(site):json({pages:[],services:[],features:{admin:false,customer:false}}));assert.equal((await fetchPublishedSite({fetcher})).pages.length,1);assert.deepEqual(await fetchPublishedSite({fetcher}),{pages:[],services:[],features:{admin:false,customer:false}});assert.equal(calls,2);
});
