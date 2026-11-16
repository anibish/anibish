CREATE TABLE file_scan_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_kind text NOT NULL CHECK(source_kind IN('file','mail_attachment','composition')),
 source_id text NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 size bigint NOT NULL CHECK(size>=0),
 safe_name text NOT NULL,
 declared_mime text NOT NULL,
 detected_mime text NOT NULL,
 validation text NOT NULL CHECK(validation IN('valid','blocked')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','scanning','clean','infected','blocked','error')),
 reason text NOT NULL DEFAULT '',
 signature_version text,
 signature_at timestamptz,
 scanned_at timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz,
 composition_content bytea,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_kind,source_id,sha256),
 CHECK(source_kind='composition' OR composition_content IS NULL),
 CHECK(composition_content IS NULL OR octet_length(composition_content)<=600000)
);
CREATE INDEX file_scan_queue ON file_scan_records(available_at) WHERE status IN('pending','error','scanning');
CREATE TABLE file_scan_events(
 id bigserial PRIMARY KEY,
 scan_id uuid NOT NULL REFERENCES file_scan_records(id),
 event text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION file_scan_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'File scan evidence is immutable'; END $$;
CREATE TRIGGER file_scan_event_immutable BEFORE UPDATE OR DELETE ON file_scan_events FOR EACH ROW EXECUTE FUNCTION file_scan_event_immutable();
