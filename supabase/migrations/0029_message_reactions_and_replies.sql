-- ============================================================================
-- 0029 — Message Reactions & Reply Threads
-- ============================================================================
-- Adds support for emoji reactions on messages (1 active reaction per user per message)
-- and message quoting / replies.

-- 1. Message Reactions Table
CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_message_user_reaction UNIQUE (message_id, user_id)
);

-- Index for fast lookup by message
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id);

ALTER TABLE message_reactions REPLICA IDENTITY FULL;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_reactions
DROP POLICY IF EXISTS "Reactions are viewable by everyone who can view the message" ON message_reactions;
CREATE POLICY "Reactions are viewable by everyone who can view the message"
  ON message_reactions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own reactions" ON message_reactions;
CREATE POLICY "Users can insert their own reactions"
  ON message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reactions" ON message_reactions;
CREATE POLICY "Users can update their own reactions"
  ON message_reactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reactions" ON message_reactions;
CREATE POLICY "Users can delete their own reactions"
  ON message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Add reply fields to direct_messages
ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID,
  ADD COLUMN IF NOT EXISTS reply_to_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_text TEXT;

-- 3. Add message_reactions to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
END $$;
