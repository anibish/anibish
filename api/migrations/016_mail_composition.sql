ALTER TABLE mail_messages ADD COLUMN correspondence jsonb NOT NULL DEFAULT '{}';
ALTER TABLE mail_drafts ADD COLUMN extras jsonb NOT NULL DEFAULT '{}';
CREATE TABLE mail_signatures(mailbox text PRIMARY KEY CHECK(mailbox IN('info','mail')),body text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now());
