-- Migration 0047: add message_reads to the realtime publication.
--
-- message_reads was created in migration 0027 with REPLICA IDENTITY FULL and RLS
-- ("Read cursors visible to conversation members"), but was never added to the
-- supabase_realtime publication alongside conversations/direct_messages/
-- message_deletions/conversation_states. Consequence: the app's `rt-reads`
-- channel had no table to subscribe to — "Seen" ticks only appeared after a full
-- snapshot reload (app foreground / pull-to-refresh), which on a slow or distant
-- connection makes read receipts feel delayed by seconds to minutes.
--
-- Adding it here lets the existing channel deliver read cursors in realtime.
-- Idempotent so re-running on a DB where it's already present is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reads'
  ) THEN
    ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reads";
  END IF;
END $$;
