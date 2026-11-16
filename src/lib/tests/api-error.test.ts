import {test} from 'node:test';
import assert from 'node:assert/strict';
import {api,ApiError} from '../api';

test('HTTP rejection exposes its status without relying on error-message text',async()=>{
 const original=globalThis.fetch;
 try{for(const status of [400,401,403,404,409,500]){globalThis.fetch=async()=>new Response(JSON.stringify({error:'Same authoritative message for every status.'}),{status});await assert.rejects(api('/qa/status-'+status,{method:'POST',body:'{}'}),e=>e instanceof ApiError&&e.status===status&&e.message==='Same authoritative message for every status.')}globalThis.fetch=async()=>new Response(JSON.stringify({error:''}),{status:400});await assert.rejects(api('/qa/empty-error-message',{method:'POST',body:'{}'}),e=>e instanceof ApiError&&e.status===400&&e.message==='The request could not be completed.')}finally{globalThis.fetch=original}
});
test('transport uncertainty remains distinct from an authoritative HTTP rejection',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>{throw new TypeError('Synthetic transport interruption')};await assert.rejects(api('/qa/transport',{method:'POST',body:'{}'}),e=>e instanceof TypeError&&!(e instanceof ApiError))}finally{globalThis.fetch=original}
});
test('duplicate rejected requests coalesce, then a later retry can reach the server again',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return new Response(JSON.stringify({error:'Synthetic validation rejection.'}),{status:400})};const results=await Promise.allSettled([api('/qa/duplicate-status',{method:'POST',body:'{}'}),api('/qa/duplicate-status',{method:'POST',body:'{}'})]);assert.equal(calls,1);for(const result of results){assert.equal(result.status,'rejected');if(result.status==='rejected'){assert.ok(result.reason instanceof ApiError);assert.equal(result.reason.status,400)}}await assert.rejects(api('/qa/duplicate-status',{method:'POST',body:'{}'}),e=>e instanceof ApiError&&e.status===400);assert.equal(calls,2)}finally{globalThis.fetch=original}
});
