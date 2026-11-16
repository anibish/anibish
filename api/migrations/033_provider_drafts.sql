ALTER TABLE mail_drafts ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE mail_draft_sync_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 draft_id uuid NOT NULL REFERENCES mail_drafts(id),
 draft_revision integer NOT NULL CHECK(draft_revision>0),
 mailbox text NOT NULL CHECK(mailbox IN('info','mail')),
 source_snapshot jsonb NOT NULL,
 message_id text NOT NULL UNIQUE,
 content_hash text NOT NULL,
 raw_sha256 text NOT NULL,
 raw_message bytea NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','uncertain','confirmed','failed','superseded','reconcile_pending')),
 append_attempted_at timestamptz,
 locked_at timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 provider_folder text,
 provider_uidvalidity text,
 provider_uid bigint,
 cleanup_status text NOT NULL DEFAULT 'not_needed',
 cleanup_attempted_at timestamptz,
 cleanup_folder text,
 cleanup_uidvalidity text,
 cleanup_uid bigint,
 last_error text,
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(draft_id,draft_revision)
);
CREATE INDEX mail_draft_sync_pending ON mail_draft_sync_jobs(status,available_at);
CREATE TABLE mail_draft_sync_events(
 id bigserial PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES mail_draft_sync_jobs(id),
 event text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_provider_draft_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.draft_id IS DISTINCT FROM NEW.draft_id OR
 OLD.draft_revision IS DISTINCT FROM NEW.draft_revision OR OLD.mailbox IS DISTINCT FROM NEW.mailbox OR
 OLD.source_snapshot IS DISTINCT FROM NEW.source_snapshot OR OLD.message_id IS DISTINCT FROM NEW.message_id OR
 OLD.content_hash IS DISTINCT FROM NEW.content_hash OR OLD.raw_sha256 IS DISTINCT FROM NEW.raw_sha256 OR
 OLD.raw_message IS DISTINCT FROM NEW.raw_message OR OLD.actor_id IS DISTINCT FROM NEW.actor_id THEN
  RAISE EXCEPTION 'Provider draft source snapshots are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER provider_draft_snapshot_immutable BEFORE UPDATE OR DELETE ON mail_draft_sync_jobs
 FOR EACH ROW EXECUTE FUNCTION protect_provider_draft_snapshot();
