ALTER TABLE outbox ADD COLUMN delivery_status text NOT NULL DEFAULT 'not_confirmed';
ALTER TABLE outbox ADD COLUMN delivery_rank integer NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN delivery_event_at timestamptz;
CREATE TABLE notification_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fingerprint text NOT NULL UNIQUE,outbox_id uuid NOT NULL REFERENCES outbox(id),event text NOT NULL,recipient text NOT NULL,provider_message_id text NOT NULL,event_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notification_events_job ON notification_events(outbox_id,event_at);
CREATE TABLE mail_suppressions(email text PRIMARY KEY,reason text NOT NULL,active boolean NOT NULL DEFAULT true,note text NOT NULL DEFAULT '',source_event_id uuid REFERENCES notification_events(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
