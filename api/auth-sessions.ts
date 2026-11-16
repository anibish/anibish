import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import type {PoolClient} from 'pg';
import {digest,token} from './security';
const legacy='anibish_session',host='__Host-anibish_session';
const verifiedLegacy=new WeakMap<FastifyRequest,{raw:string;expires:Date}>();
function seconds(name:string,fallback:number,min:number,max:number){const value=process.env[name];if(value===undefined)return fallback;const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(name+' is outside the supported security interval.');return n}
export const absoluteSessionSeconds=()=>seconds('ANIBISH_SESSION_ABSOLUTE_SECONDS',43200,300,86400);
export const idleSessionSeconds=(privileged:boolean)=>privileged?seconds('ANIBISH_STAFF_IDLE_SECONDS',900,60,43200):seconds('ANIBISH_CUSTOMER_IDLE_SECONDS',1800,60,43200);
export function sessionCookieName(){return process.env.NODE_ENV==='production'?host:legacy}
export function setSessionCookie(reply:FastifyReply,raw:string,maxAge=absoluteSessionSeconds()){reply.setCookie(sessionCookieName(),raw,{path:'/',httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge});if(process.env.NODE_ENV==='production')reply.clearCookie(legacy,{path:'/',httpOnly:true,secure:true,sameSite:'strict'})}
export function clearSessionCookies(reply:FastifyReply){reply.clearCookie(legacy,{path:'/',httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict'});if(process.env.NODE_ENV==='production')reply.clearCookie(host,{path:'/',httpOnly:true,secure:true,sameSite:'strict'})}
export function verifiedSession(req:FastifyRequest,raw:string,expires:string|Date){if(process.env.NODE_ENV==='production'&&!req.cookies[host])verifiedLegacy.set(req,{raw,expires:new Date(expires)})}
export function registerSessionCookieMigration(app:FastifyInstance){
 // The host-only cookie always wins. Normalize internally so existing scoped
 // handlers bind export/read-state operations to the same authenticated token.
 app.addHook('onRequest',async req=>{if(process.env.NODE_ENV==='production'&&req.cookies[host])req.cookies[legacy]=req.cookies[host]});
 app.addHook('onSend',async(req,reply,payload)=>{if(process.env.NODE_ENV!=='production')return payload;const value=reply.getHeader('set-cookie'),cookies=Array.isArray(value)?value.map(String):value?[String(value)]:[];const touchesSession=cookies.some(c=>c.startsWith(legacy+'=')||c.startsWith(host+'='));if(touchesSession){if(cookies.some(c=>c.startsWith(legacy+'=;'))&&!cookies.some(c=>c.startsWith(host+'=')))reply.clearCookie(host,{path:'/',httpOnly:true,secure:true,sameSite:'strict'});return payload}const upgrade=verifiedLegacy.get(req);if(upgrade){const remaining=Math.floor((upgrade.expires.getTime()-Date.now())/1000);if(remaining>0)setSessionCookie(reply,upgrade.raw,remaining)}return payload});
}
/** Caller supplies a transaction: lock the user through credential recheck and session insertion. */
export async function replaceSession(db:PoolClient,userId:string,oldRaw:string|undefined,mfaVerified:boolean,orgId?:string,expected?:{password_hash:string;mfa_enabled:boolean;mfa_secret:string|null}){const [user]=(await db.query('SELECT id,password_hash,mfa_enabled,mfa_secret FROM users WHERE id=$1 AND disabled_at IS NULL AND verified=true FOR UPDATE',[userId])).rows;if(!user||expected&&(user.password_hash!==expected.password_hash||user.mfa_enabled!==expected.mfa_enabled||user.mfa_secret!==expected.mfa_secret))return null;const raw=token();if(oldRaw)await db.query('DELETE FROM sessions WHERE id=$1 AND user_id=$2',[digest(oldRaw),userId]);await db.query("INSERT INTO sessions(id,user_id,mfa_verified,expires_at,active_org_id,last_activity_at) VALUES($1,$2,$3,now()+($4::int*interval '1 second'),$5,now())",[digest(raw),userId,mfaVerified,absoluteSessionSeconds(),orgId||null]);return raw}
