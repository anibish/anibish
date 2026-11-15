import {migrate} from './migrate';
import {seedPublicContent} from './seed-content';
import {pool} from './db';
await migrate();await seedPublicContent();await pool.end();console.log('Production migrations and approved editorial foundations prepared. No customer/demo financial records imported.');
