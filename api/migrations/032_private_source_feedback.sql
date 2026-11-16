-- Preserve the 75 historical archive occurrences separately from later sources.
ALTER TABLE review_candidates ADD COLUMN source_kind text NOT NULL DEFAULT 'archive'
 CHECK(source_kind IN('archive','portfolio_feedback'));
ALTER TABLE review_candidates ALTER COLUMN source_number DROP NOT NULL;
ALTER TABLE review_candidates ADD CONSTRAINT review_candidate_source_identity
 CHECK((source_kind='archive' AND source_number IS NOT NULL) OR
       (source_kind='portfolio_feedback' AND source_number IS NULL));

CREATE TABLE review_candidate_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 candidate_id text NOT NULL REFERENCES review_candidates(id),
 source_id uuid NOT NULL REFERENCES portfolio_sources(id),
 source_history_id bigint NOT NULL REFERENCES portfolio_source_history(id),
 source_hash text NOT NULL,
 feedback_hash text NOT NULL,
 feedback_snapshot jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,feedback_hash)
);
CREATE INDEX review_candidate_sources_candidate ON review_candidate_sources(candidate_id);
CREATE INDEX review_candidate_sources_feedback ON review_candidate_sources(feedback_hash);

CREATE TABLE review_candidate_versions(
 id bigserial PRIMARY KEY,
 candidate_id text NOT NULL REFERENCES review_candidates(id),
 event text NOT NULL,
 revision integer NOT NULL,
 snapshot jsonb NOT NULL,
 actor_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_candidate_versions_candidate ON review_candidate_versions(candidate_id,id);
-- This is a current-state baseline, not a reconstruction of unavailable history.
INSERT INTO review_candidate_versions(candidate_id,event,revision,snapshot)
 SELECT id,'migration_baseline',revision,to_jsonb(review_candidates) FROM review_candidates;

CREATE FUNCTION preserve_review_evidence_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Review evidence history is immutable';
END $$;
CREATE TRIGGER review_candidate_sources_immutable BEFORE UPDATE OR DELETE ON review_candidate_sources
 FOR EACH ROW EXECUTE FUNCTION preserve_review_evidence_history();
CREATE TRIGGER review_candidate_versions_immutable BEFORE UPDATE OR DELETE ON review_candidate_versions
 FOR EACH ROW EXECUTE FUNCTION preserve_review_evidence_history();
