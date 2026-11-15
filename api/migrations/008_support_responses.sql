ALTER TABLE tickets ADD COLUMN first_response_at timestamptz;
CREATE TABLE ticket_replies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL REFERENCES organizations(id),ticket_id uuid NOT NULL REFERENCES tickets(id),user_id uuid NOT NULL REFERENCES users(id),body text NOT NULL,internal boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ticket_replies_thread ON ticket_replies(ticket_id,created_at);
