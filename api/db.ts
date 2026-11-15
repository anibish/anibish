import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from './schema';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||'postgresql://anibish@127.0.0.1:54368/postgres',max:10});
export const db=drizzle(pool,{schema});
export async function transaction<T>(fn:(client:pg.PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
