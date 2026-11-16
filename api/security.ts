import {randomBytes,scrypt as callbackScrypt,timingSafeEqual,createHash,createHmac,createCipheriv,createDecipheriv} from 'node:crypto';
import type {PoolClient} from 'pg';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
export const token=()=>randomBytes(32).toString('hex');
export const digest=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
// OWASP's equivalent 32MiB scrypt profile; fixed tuples prevent stored-parameter
// injection. Two jobs reserve about64MiB rather than exhausting the API budget.
export const passwordHashParameters=Object.freeze({N:32768,r:8,p:3,keyLength:64,maxmem:64*1024*1024});
const passwordJobs:{active:number;waiting:(()=>void)[]}={active:0,waiting:[]};
export class PasswordWorkQueueBusy extends Error{readonly statusCode=429;readonly code='PASSWORD_WORK_QUEUE_BUSY';constructor(){super('Security checks are busy. Wait a moment, then retry with a fresh code if one was supplied.');this.name='PasswordWorkQueueBusy'}}
export function passwordWorkState(){return {active:passwordJobs.active,queued:passwordJobs.waiting.length,max_active:2,max_queued:8}}
async function passwordWork<T>(work:()=>Promise<T>):Promise<T>{
 if(passwordJobs.active>=2){if(passwordJobs.waiting.length>=8)throw new PasswordWorkQueueBusy();await new Promise<void>(ready=>passwordJobs.waiting.push(ready))}else passwordJobs.active++;
 try{return await work()}finally{const next=passwordJobs.waiting.shift();if(next)next();else passwordJobs.active--}
}
function derivePassword(password:string,salt:string|Buffer,legacy=false){return passwordWork(()=>new Promise<Buffer>((resolve,reject)=>callbackScrypt(password,salt,64,{N:legacy?16384:32768,r:8,p:legacy?1:3,maxmem:passwordHashParameters.maxmem},(error,key)=>error?reject(error):resolve(key))))}
function passwordValue(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=128}
function parsePasswordHash(stored:unknown){
 if(typeof stored!=='string'||stored.length>240)return null;
 const current=/^\$anibish\$scrypt\$v1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
 if(current)return {salt:Buffer.from(current[1],'hex'),key:Buffer.from(current[2],'hex'),legacy:false};
 const legacy=/^([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
 return legacy?{salt:legacy[1],key:Buffer.from(legacy[2],'hex'),legacy:true}:null;
}
export function passwordHashNeedsUpgrade(stored:string){return Boolean(parsePasswordHash(stored)?.legacy)}
export async function hashPassword(password:string){if(!passwordValue(password))fail(400,'Password must contain between 1 and 128 characters.');const salt=randomBytes(16);const hash=await derivePassword(password,salt);return `$anibish$scrypt$v1$32768$8$3$${salt.toString('hex')}$${hash.toString('hex')}`}
export async function verifyPassword(password:string,stored:string){const parsed=parsePasswordHash(stored);if(!parsed||!passwordValue(password))return false;const actual=await derivePassword(password,parsed.salt,parsed.legacy);return timingSafeEqual(actual,parsed.key)}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function mfaSecret(){const bytes=randomBytes(20);let bits='';for(const b of bytes)bits+=b.toString(2).padStart(8,'0');return bits.match(/.{1,5}/g)!.map(s=>alphabet[parseInt(s.padEnd(5,'0'),2)]).join('')}
function decode(secret:string){const bits=[...secret].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('');return Buffer.from((bits.match(/.{8}/g)||[]).map(s=>parseInt(s,2)))}
export function totp(secret:string,at=Date.now()){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(at/30000)));const mac=createHmac('sha1',decode(secret)).update(counter).digest();const off=mac[mac.length-1]&15;return ((mac.readUInt32BE(off)&0x7fffffff)%1000000).toString().padStart(6,'0')}
export function verifyTotp(secret:string,code:string,at=Date.now()){return /^\d{6}$/.test(code)&&timingSafeEqual(Buffer.from(totp(secret,at)),Buffer.from(code))}
/** Accept a factor only once, in the current server-controlled30-second step. */
export async function consumeTotp(db:Pick<PoolClient,'query'>,userId:string,encryptedSeed:string,code:string|undefined){if(!code||!encryptedSeed)return false;const now=Date.now();if(!verifyTotp(decryptSecret(encryptedSeed),code,now))return false;const result=await db.query('UPDATE users SET mfa_last_step=$2 WHERE id=$1 AND mfa_secret=$3 AND (mfa_last_step IS NULL OR mfa_last_step<$2)',[userId,Math.floor(now/30000),encryptedSeed]);return result.rowCount===1}
export const privileged=['super_admin','admin','sales_manager','project_manager','developer','designer','finance_manager','support_agent'];
export function can(role:string,domain:string,write:boolean){if(['super_admin','admin'].includes(role))return true;const grants:Record<string,string[]>={sales_manager:['leads','quotes','customers','contracts'],project_manager:['projects','milestones','tasks','deliveries','conversations','messages','files'],developer:['projects','milestones','tasks','conversations','messages','files'],designer:['projects','tasks','deliveries','conversations','messages','files'],finance_manager:['invoices','payments','refunds','orders','expenses','retainers'],support_agent:['tickets','conversations','messages','files']};return Boolean(grants[role]?.includes(domain))&&(!write||domain!=='customers')}
export function fail(status:number,message:string):never{throw Object.assign(new Error(message),{statusCode:status})}

function encryptionKey(){if(process.env.MFA_ENCRYPTION_KEY){const k=Buffer.from(process.env.MFA_ENCRYPTION_KEY,'hex');if(k.length!==32)throw new Error('MFA_ENCRYPTION_KEY must contain 32 random bytes as hex.');return k}if(process.env.NODE_ENV==='production')throw new Error('MFA_ENCRYPTION_KEY is required in production.');const dir=resolve('.local');mkdirSync(dir,{recursive:true,mode:0o700});const file=resolve(dir,'mfa-key');if(!existsSync(file))writeFileSync(file,randomBytes(32).toString('hex'),{mode:0o600});return Buffer.from(readFileSync(file,'utf8'),'hex')}
export function encryptSecret(secret:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),encrypted.toString('hex')].join(':')}
export function decryptSecret(value:string){const [iv,tag,data]=value.split(':');if(!data)throw new Error('MFA secret requires re-enrollment.');const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([decipher.update(Buffer.from(data,'hex')),decipher.final()]).toString('utf8')}
