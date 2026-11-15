import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {pool} from './db';
import {hashPassword} from './security';
const rl=createInterface({input:stdin,output:stdout});
const email=(process.env.ADMIN_EMAIL||await rl.question('Existing verified account email to promote: ')).trim().toLowerCase();
const result=await pool.query('UPDATE users SET global_role=\'super_admin\' WHERE email=$1 AND verified=true RETURNING id',[email]);
console.log(result.rowCount?'Role granted. Sign in and enroll MFA before administration.':'No verified account found. Register and verify the account first.');rl.close();await pool.end();
