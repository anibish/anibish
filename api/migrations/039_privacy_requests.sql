-- Additive, private, self-scoped request records. No automatic data erasure.
CREATE TABLE IF NOT EXISTS privacy_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 org_id uuid NOT NULL REFERENCES organizations(id),
 type text NOT NULL CHECK(type IN('access','correction','erasure','restriction','objection','portability','complaint')),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','identity_check','in_review','awaiting_customer','fulfilled','declined','withdrawn')),
 description text NOT NULL,
 customer_response text NOT NULL DEFAULT '',
 framework text,
 due_date date,
 client_reference uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,client_reference)
);
CREATE INDEX IF NOT EXISTS privacy_requests_scope ON privacy_requests(user_id,org_id,created_at DESC);
CREATE TABLE IF NOT EXISTS privacy_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES privacy_requests(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 event text NOT NULL,
 body text NOT NULL DEFAULT '',
 customer_visible boolean NOT NULL DEFAULT false,
 revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_request_events_request ON privacy_request_events(request_id,created_at);
CREATE TRIGGER immutable_privacy_request_events BEFORE UPDATE OR DELETE ON privacy_request_events FOR EACH ROW EXECUTE FUNCTION immutable_legal_record();
CREATE TABLE IF NOT EXISTS privacy_exports (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 org_id uuid NOT NULL REFERENCES organizations(id),
 session_id text NOT NULL,
 request_id uuid REFERENCES privacy_requests(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz
);
CREATE INDEX IF NOT EXISTS privacy_exports_expiry ON privacy_exports(expires_at);
