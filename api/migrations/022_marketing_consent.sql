CREATE TABLE marketing_consents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),opted_in boolean NOT NULL,workflow text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER immutable_marketing_consents BEFORE UPDATE OR DELETE ON marketing_consents FOR EACH ROW EXECUTE FUNCTION immutable_legal_record();
