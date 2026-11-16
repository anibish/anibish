import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountActionHref,readAccountLocation} from '../account-links';
const token='a1'.repeat(32);
test('new account action links keep tokens in fragments and redact after capture',()=>{
 for(const kind of ['verify','reset','invitation'] as const){const href=accountActionHref(token,kind),u=new URL(href,'https://anibish.com');assert.equal(u.search,'');const parsed=readAccountLocation(u.href);assert.equal(parsed.token,token);assert.equal(parsed.kind,kind);assert.equal(parsed.redactedPath,'/account');}
});
test('legacy query tokens remain redeemable but are removed from browser history',()=>{
 for(const suffix of ['?token='+token+'&kind=reset','?invite='+token]){const p=readAccountLocation('https://anibish.com/account'+suffix);assert.equal(p.token,token);assert.ok(!p.redactedPath.includes(token));assert.ok(!p.redactedPath.includes('token='));assert.ok(!p.redactedPath.includes('invite='));}
});
test('invitation sign-in continuation never requires a token in the login query',()=>{
 const next=accountActionHref(token,'invitation'),url=new URL('/login#next='+encodeURIComponent(next),'https://anibish.com');assert.equal(url.search,'');const p=readAccountLocation(url.href);assert.equal(p.next,next);assert.equal(p.redactedPath,'/login');
 const legacy=readAccountLocation('https://anibish.com/login?next='+encodeURIComponent('/account?invite='+token));assert.equal(legacy.next,next);assert.equal(legacy.redactedPath,'/login');
});
test('ambiguous, malformed and unsupported action links cannot supply a token',()=>{
 for(const suffix of ['#token=short&kind=verify','#token='+token+'&kind=unknown','?token='+token+'&kind=reset#token='+token+'&kind=reset','#token='+token+'&token='+token+'&kind=verify']){const p=readAccountLocation('https://anibish.com/account'+suffix);assert.equal(p.token,'');assert.equal(p.invalid,true);assert.ok(!p.redactedPath.includes(token));}
});
test('return links reject external, protocol-relative and backslash destinations',()=>{
 for(const next of ['https://outside.example/','//outside.example/','/\\outside.example/','/account#token=bad&kind=invitation'])assert.equal(readAccountLocation('https://anibish.com/login#next='+encodeURIComponent(next)).next,'');
});
