-- Private source records are never included in /public/site.
CREATE TABLE portfolio_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL CHECK(provider IN('github','fiverr','profile','public_source')),
 external_key text NOT NULL,
 title text NOT NULL,
 facts jsonb NOT NULL DEFAULT '{}',
 source_hash text NOT NULL,
 page_id uuid REFERENCES cms_pages(id),
 clearance text NOT NULL DEFAULT 'pending' CHECK(clearance IN('pending','cleared','restricted','excluded')),
 owner_notes text NOT NULL DEFAULT '',
 imported_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,external_key)
);
CREATE TABLE portfolio_source_history(id bigserial PRIMARY KEY,source_id uuid NOT NULL REFERENCES portfolio_sources(id),source_hash text NOT NULL,facts jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
