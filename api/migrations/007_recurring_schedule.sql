ALTER TABLE billing_agreements ADD COLUMN anchor_day int;
UPDATE billing_agreements SET anchor_day=extract(day FROM next_bill_date)::int;
ALTER TABLE billing_agreements ALTER COLUMN anchor_day SET NOT NULL;
ALTER TABLE billing_agreements ADD CHECK(anchor_day BETWEEN 1 AND 31);
CREATE FUNCTION next_billing_date(current_date_value date, months_value int, anchor_value int) RETURNS date LANGUAGE sql IMMUTABLE AS $$
 SELECT (date_trunc('month',current_date_value)+make_interval(months=>months_value))::date
   + (LEAST(anchor_value,extract(day FROM date_trunc('month',current_date_value)+make_interval(months=>months_value+1)-interval '1 day')::int)-1);
$$;
CREATE TABLE billing_notice_events(agreement_id uuid NOT NULL REFERENCES billing_agreements(id),period date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(agreement_id,period));
CREATE FUNCTION set_billing_anchor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.anchor_day=COALESCE(NEW.anchor_day,extract(day FROM NEW.next_bill_date)::int); RETURN NEW; END $$;
CREATE TRIGGER billing_anchor BEFORE INSERT ON billing_agreements FOR EACH ROW EXECUTE FUNCTION set_billing_anchor();
