import {hashPassword} from './security';

export const NEW_PASSWORD_ERROR='Choose a less predictable password (12–128 characters). Avoid common passwords, repeated characters, your account details and the Anibish name. A longer unrelated passphrase is a good option.';
export class NewPasswordPolicyError extends Error{readonly statusCode=400;readonly code='NEW_PASSWORD_NOT_ALLOWED';constructor(){super(NEW_PASSWORD_ERROR);this.name='NewPasswordPolicyError';}}
export type PasswordContext={email?:string;name?:string;organization?:string};
// A deliberately modest, locally bundled list. This is not a complete breached-
// password corpus, entropy meter, or guarantee that an accepted password is safe.
const common=[
 'password1234','password12345','password123456','passwordpassword','passwordpassword123',
 'qwerty123456','qwertyuiop12','qwertyuiop123','qwertyuiop123456','asdfghjkl123','qazwsxedc123',
 '123456789012','1234567890123','12345678901234','123456789012345','1234567890123456','123456123456','123456789123','123123123123',
 'adminadmin12','administrator','administrator123','welcome12345','welcome123456','letmein123456','changeme12345','changeme123456',
 'iloveyou12345','iloveyou123456','monkeymonkey','dragon123456','abc123abc123',
];
const compact=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
const leet=(value:string)=>value.replace(/[@43015$!7]/g,c=>({'@':'a','4':'a','3':'e','0':'o','1':'i','5':'s','$':'s','!':'i','7':'t'}[c]!));
const listed=new Set(common.flatMap(value=>[compact(value),compact(leet(value))]));
const predictable=/^(?:password|qwerty|welcome|letmein|changeme|administrator|admin|iloveyou)[0-9]*$/;
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Screen only a NEW credential. Never call this from login/verification/legacy rehash. */
export function validateNewPassword(password:string,context:PasswordContext={}){
 if(typeof password!=='string'||password.length<12||password.length>128)throw new NewPasswordPolicyError();
 const points=[...password];if(points.every(point=>point===points[0]))throw new NewPasswordPolicyError();
 const folded=password.normalize('NFKC').toLowerCase(),value=compact(password);
 if(listed.has(value)||listed.has(compact(leet(folded.replace(/[!@#$%^&*()_+=:;,.? -]+$/,''))))||predictable.test(value))throw new NewPasswordPolicyError();
 const account=[context.name,context.organization,context.email?.split('@',1)[0]?.split('+',1)[0]].filter((x):x is string=>typeof x==='string').map(compact).filter(x=>x.length>=4&&x.length<=64);
 const stems=new Set(['anibish','anibishcom','anilbishnoi','bishnoi',...account]);
 for(const stem of stems){const pattern=new RegExp('^(?:(?:password|admin|welcome))?'+escape(stem)+'(?:(?:password|admin|welcome))?[0-9]*$');if(pattern.test(value))throw new NewPasswordPolicyError();}
 // Screening normalization is never used as the credential passed to scrypt.
}
export async function hashNewPassword(password:string,context:PasswordContext={}){validateNewPassword(password,context);return hashPassword(password);}
