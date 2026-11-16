import type {PoolClient} from 'pg';
/** Enqueue within the business transaction. Provider delivery is confirmed later by callbacks. */
export async function enqueueBusinessEvent(db:PoolClient,org:string,event:string,body:string,key:string){
 await db.query('INSERT INTO notifications(org_id,title,body) VALUES($1,$2,$3)',[org,event,body]);
 await db.query("INSERT INTO notifications(user_id,title,body) SELECT id,$1,$2 FROM users WHERE global_role IN('super_admin','admin')",[event,body]);
 await db.query(`INSERT INTO outbox(recipient,template,payload,dedupe_key)
 SELECT recipient,$2,$3,$4||':'||recipient FROM (
 SELECT u.email AS recipient FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.org_id=$1 AND u.preferences->'email_updates' IS DISTINCT FROM 'false'::jsonb
 UNION SELECT $5::text WHERE NOT EXISTS(SELECT 1 FROM users WHERE email=$5 AND preferences->'email_updates'='false'::jsonb)
 ) recipients ON CONFLICT(dedupe_key) DO NOTHING`,[org,event,JSON.stringify({body}),key,process.env.CONTACT_EMAIL||'mail@anibish.com']);
}
