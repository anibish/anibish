-- Additive: preserve enrolled MFA ciphertext, owner credentials and valid sessions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step bigint;
-- Existing sessions begin their configured idle window at migration time.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS sessions_activity_expiry ON sessions(last_activity_at,expires_at);
-- Legacy sessions keep compatibility until their existing expiry. Future sessions
-- require the host-only production cookie; never flip old rows on first upgrade.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS host_cookie_required boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ALTER COLUMN host_cookie_required SET DEFAULT true;
