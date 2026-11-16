-- Legacy messages retain NULL. New send references are scoped to the authenticated author and conversation.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS messages_idempotency_scope
 ON messages(org_id,conversation_id,user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
