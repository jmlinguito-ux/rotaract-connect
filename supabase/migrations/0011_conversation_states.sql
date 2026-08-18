-- ============================================================================
-- 0011 — Per-user conversation state: pin / archive / delete-for-me
-- ============================================================================
-- A conversation is a single shared row (schema.sql), so inbox-management actions
-- must be PER USER and must never touch the other party's view. Each user keeps
-- one state row per conversation recording whether THEY pinned, archived, or
-- deleted it from their own inbox. Nothing here mutates `conversations` or
-- `direct_messages`, so User A pinning/archiving/deleting leaves User B untouched.
--
-- delete-for-me is a soft hide with a timestamp: the thread disappears from the
-- user's inbox, and a message newer than `deleted_at` un-hides it (Messenger
-- behavior). No message or conversation row is ever destroyed.
-- Everything is additive and idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS conversation_states (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pinned BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  -- When set, the thread is hidden from this user's inbox up to this instant.
  -- A later message (created_at > deleted_at) brings it back.
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_states_user ON conversation_states(user_id);

ALTER TABLE conversation_states REPLICA IDENTITY FULL;
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;

-- A user only ever sees, creates, updates, or removes their OWN state rows.
DROP POLICY IF EXISTS "Own conversation state is visible" ON conversation_states;
CREATE POLICY "Own conversation state is visible" ON conversation_states
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users set their own conversation state" ON conversation_states;
CREATE POLICY "Users set their own conversation state" ON conversation_states
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update their own conversation state" ON conversation_states;
CREATE POLICY "Users update their own conversation state" ON conversation_states
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users clear their own conversation state" ON conversation_states;
CREATE POLICY "Users clear their own conversation state" ON conversation_states
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Sync pin/archive/delete across the user's own devices.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversation_states;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_table THEN NULL;
END $$;
