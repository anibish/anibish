import type {PoolClient} from 'pg';

/** A matching authenticated provider callback is evidence that SMTP already accepted
 * this message. It must never be treated as a fresh automatic/manual retry. */
export const providerAcceptanceSql = `(outbox.delivery_status IN ('request','sent','delivered') OR EXISTS (
 SELECT 1 FROM notification_events accepted
 WHERE accepted.outbox_id=outbox.id AND accepted.event IN ('request','sent','delivered')
))`;

export async function reconcileAcceptedOutbox(db:Pick<PoolClient,'query'>,id:string){
 const result=await db.query(`UPDATE outbox SET status='sent',locked_at=NULL,last_error=NULL,
 sent_at=COALESCE(sent_at,(SELECT min(event_at) FROM notification_events accepted WHERE accepted.outbox_id=outbox.id AND accepted.event IN ('request','sent','delivered')),now())
 WHERE id=$1 AND status IN ('pending','retry','processing','unknown','failed','sent') AND ${providerAcceptanceSql}
 RETURNING id`,[id]);
 return Boolean(result.rowCount);
}
