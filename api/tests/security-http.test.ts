import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {registerCspReports,registerPrivateApiCaching,sanitizeCspReport} from '../security-http';

const report={'csp-report':{'document-uri':'http://localhost:3000/dashboard/project/private-client?token=secret','effective-directive':'script-src-elem','blocked-uri':'https://untrusted.test/private?email=private','source-file':'http://localhost:3000/source?credential=secret','original-policy':"script-src 'nonce-PRIVATE'",'script-sample':'PRIVATE SCRIPT','referrer':'https://private.test','line-number':12,'column-number':9}};
test('CSP telemetry retains only bounded categories and discards private URLs, snippets and policy nonces',()=>{
 const result=sanitizeCspReport(report,'http://localhost:3000');assert.equal(result.length,1);assert.deepEqual(result[0],{untrusted_browser_report:true,route:'/dashboard/*',directive:'script-src-elem',blocked_resource:'external-origin',source_resource:'same-origin',disposition:'enforce',line:12,column:9});
 assert.doesNotMatch(JSON.stringify(result),/secret|private-client|PRIVATE|untrusted\.test/);
 assert.equal(sanitizeCspReport({'csp-report':{...report['csp-report'],'document-uri':'https://other.test'}},'http://localhost:3000').length,0);
 assert.equal(sanitizeCspReport({'csp-report':{...report['csp-report'],'effective-directive':'arbitrary-private-text'}},'http://localhost:3000').length,0);
 const modern={type:'csp-violation',body:{documentURL:'http://localhost:3000/login?token=SECRET',effectiveDirective:'base-uri',blockedURL:'inline',lineNumber:2}};
 assert.equal(sanitizeCspReport(Array(20).fill(modern),'http://localhost:3000').length,4);
});
test('CSP receiver validates content, bounds body/batch/rate, and private caching covers success and errors',async()=>{
 const saved:unknown[]=[];const app=Fastify();await app.register(rateLimit);registerPrivateApiCaching(app);registerCspReports(app,async detail=>{saved.push(detail)});
 app.get('/private-fixture',async()=>({fixture:true}));
 try{
  const good=await app.inject({method:'POST',url:'/security/csp-report',headers:{'content-type':'application/csp-report'},payload:JSON.stringify(report)});assert.equal(good.statusCode,204);assert.equal(saved.length,1);assert.equal(good.headers['cache-control'],'private, no-store');
  for(const path of['/private-fixture','/missing-fixture'])assert.equal((await app.inject({url:path})).headers['cache-control'],'private, no-store');
  assert.equal((await app.inject({method:'POST',url:'/security/csp-report',headers:{'content-type':'application/csp-report'},payload:'invalid'})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/security/csp-report',headers:{'content-type':'application/csp-report'},payload:JSON.stringify({'csp-report':{'document-uri':'https://attacker.test'}})})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/security/csp-report',headers:{'content-type':'application/csp-report'},payload:'x'.repeat(8193)})).statusCode,413);
  const replies=[];for(let i=0;i<13;i++)replies.push((await app.inject({method:'POST',url:'/security/csp-report',headers:{'content-type':'application/csp-report'},payload:JSON.stringify(report)})).statusCode);assert.ok(replies.includes(429));assert.ok(saved.length<=12);
 }finally{await app.close()}
});
