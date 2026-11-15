CREATE OR REPLACE FUNCTION protect_finalized_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state='finalized' AND
    (NEW.total,NEW.number,NEW.currency,NEW.org_id,NEW.order_id,NEW.lines,NEW.subtotal,NEW.tax_rate_bps,NEW.tax_amount,NEW.discount,NEW.deposit_applied,NEW.business_snapshot,NEW.due_date,NEW.milestone_id,NEW.kind,NEW.finalized_at,NEW.state)
    IS DISTINCT FROM
    (OLD.total,OLD.number,OLD.currency,OLD.org_id,OLD.order_id,OLD.lines,OLD.subtotal,OLD.tax_rate_bps,OLD.tax_amount,OLD.discount,OLD.deposit_applied,OLD.business_snapshot,OLD.due_date,OLD.milestone_id,OLD.kind,OLD.finalized_at,OLD.state)
  THEN RAISE EXCEPTION 'Finalized invoice content is immutable'; END IF;
  RETURN NEW;
END $$;
