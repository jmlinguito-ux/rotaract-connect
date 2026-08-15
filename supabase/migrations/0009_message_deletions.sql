-- ============================================================================
-- 0009 — Per-user "delete for me" on chat messages
-- ============================================================================
-- Messages are a single shared row, so "delete for me" is a soft, per-user hide:
-- each user records which messages THEY have removed from their own view. Others
-- still see the message. No message row is ever deleted.

CREATE TABLE IF NOT EXISTS message_deletions (
  message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_deletions_user ON message_deletions(user_id);

ALTER TABLE message_deletions REPLICA IDENTITY FULL;
ALTER TABLE message_deletions ENABLE ROW LEVEL SECURITY;

-- A user only ever sees, creates, or removes their OWN deletion records.
DROP POLICY IF EXISTS "Own message deletions are visible" ON message_deletions;
CREATE POLICY "Own message deletions are visible" ON message_deletions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users hide messages for themselves" ON message_deletions;
CREATE POLICY "Users hide messages for themselves" ON message_deletions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can undo their own hide" ON message_deletions;
CREATE POLICY "Users can undo their own hide" ON message_deletions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Sync the hide across the user's own devices.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE message_deletions;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_table THEN NULL;
END $$;
