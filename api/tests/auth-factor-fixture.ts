import {totp} from '../security';
import type {FastifyInstance,InjectOptions} from 'fastify';

const wallClock=Date.now;
let offset=0;

/**
 * Existing workflow fixtures need a fresh factor after enrollment. Advance only
 * this isolated test worker's clock; the production verifier is never bypassed.
 * Replay/concurrency security tests deliberately use the unmodified totp helper.
 */
export function freshTotp(secret:string,at?:number):string {
 if(at!==undefined)return totp(secret,at);
 offset+=30000;
 Date.now=()=>wallClock()+offset;
 return totp(secret);
}

const rotatedCookies=new Map<string,string>();
function currentCookie(value:string):string {
 const visited=new Set<string>();
 while(rotatedCookies.has(value)&&!visited.has(value)){visited.add(value);value=rotatedCookies.get(value)!;}
 return value;
}

/** Only absorb the browser's post-enrollment rotation; never bypass revocation. */
export async function fixtureInject(app:FastifyInstance,options:InjectOptions){
 const original=String(options.headers?.cookie||''),cookie=currentCookie(original);
 const response=await app.inject({...options,headers:{...options.headers,...cookie?{cookie}:{}}});
 if(response.statusCode===200&&String(options.url).split('?')[0]==='/auth/mfa/verify'){
  const values=response.headers['set-cookie'],headers=Array.isArray(values)?values:values?[values]:[];
  const replacement=headers.find(value=>/^(?:__Host-)?anibish_session=/.test(value)&&!/Max-Age=0\b/i.test(value));
  if(replacement&&original){const next=replacement.split(';',1)[0];rotatedCookies.set(original,next);if(cookie!==original)rotatedCookies.set(cookie,next);}
 }
 return response;
}
