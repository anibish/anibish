CREATE TABLE IF NOT EXISTS mail_sends(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),idempotency_key uuid NOT NULL UNIQUE,mailbox text NOT NULL,content_hash text NOT NULL,message_id text NOT NULL,status text NOT NULL,raw_message bytea NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());

CREATE UNIQUE INDEX IF NOT EXISTS mail_lead_once ON mail_links(message_id) WHERE kind='lead';
