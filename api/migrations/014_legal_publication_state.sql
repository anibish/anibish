CREATE TABLE legal_policy_state(policy text PRIMARY KEY CHECK(policy IN('privacy','terms')),enabled boolean NOT NULL DEFAULT false);
INSERT INTO legal_policy_state(policy,enabled) SELECT p,EXISTS(SELECT 1 FROM legal_versions WHERE policy=p) FROM unnest(ARRAY['privacy','terms']) AS p;
