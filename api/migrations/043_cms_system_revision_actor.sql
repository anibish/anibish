-- A trusted maintenance import must not impersonate an owner. Existing actor
-- references stay intact; authenticated CMS routes still supply their actor.
ALTER TABLE cms_revisions ALTER COLUMN actor_id DROP NOT NULL;
