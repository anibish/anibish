CREATE FUNCTION record_invoice_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW IS DISTINCT FROM OLD THEN
  INSERT INTO invoice_history(invoice_id,event,snapshot) VALUES(NEW.id,CASE WHEN TG_OP='INSERT' THEN 'draft_created' ELSE 'record_updated' END,to_jsonb(NEW));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_change AFTER INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION record_invoice_change();
