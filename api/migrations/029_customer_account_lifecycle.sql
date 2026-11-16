-- Additive: preserve all customer decisions, financial records and owner credentials.
ALTER TABLE users ADD COLUMN disabled_at timestamptz;
CREATE TABLE organization_billing_profiles (
 org_id uuid PRIMARY KEY REFERENCES organizations(id),
 data jsonb NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
