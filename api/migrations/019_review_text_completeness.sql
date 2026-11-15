ALTER TABLE review_candidates ADD COLUMN IF NOT EXISTS text_truncated boolean NOT NULL DEFAULT false;
