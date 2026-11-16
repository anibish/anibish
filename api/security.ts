import {randomBytes,scrypt as callbackScrypt,timingSafeEqual,createHash,createHmac,createCipheriv,createDecipheriv} from 'node:crypto';
import type {PoolClient} from 'pg';
import {promisify} from 'node:util';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const scrypt=promisify(callbackScrypt);
export const token=()=>randomBytes(32).toString('hex');
export const digest=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64) as Buffer;return `${salt}:${hash.toString('hex')}`}
export async function verifyPassword(password:string,stored:string){const [salt,key]=stored.split(':');if(!salt||!key)return false;const actual=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(key,'hex');return expected.length===actual.length&&timingSafeEqual(actual,expected)}
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
