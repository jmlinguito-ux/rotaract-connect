-- ============================================================================
-- 0007 — Realtime everywhere, chat attachments, read receipts, organizer banners
-- ============================================================================
-- Adds the schema needed for:
--   * app-wide realtime (publish the tables the client subscribes to)
--   * photo attachments on chat messages (metadata only; bytes live in Storage)
--   * group-aware read receipts (a per-conversation read cursor, not per-message)
--   * organizer banner notifications with a priority (NORMAL / ALERT / HIGH)
-- Everything is additive and idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Realtime publication — the client subscribes to postgres_changes on these.
--    notifications + direct_messages were already published in schema.sql.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'events', 'event_participants', 'event_invitations', 'event_impacts',
    'conversations', 'verification_applications', 'message_reads'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- Realtime UPDATE/DELETE payloads only carry the changed columns unless the table
-- replicates its full row. The client merges rows by id, so it needs the whole row.
ALTER TABLE direct_messages REPLICA IDENTITY FULL;
ALTER TABLE events REPLICA IDENTITY FULL;
ALTER TABLE event_participants REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- 2. Chat photo attachments — metadata on the message row; bytes in Storage.
-- ---------------------------------------------------------------------------
ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT;   -- 'image' for now

-- A message may now be an attachment with no text, so relax the NOT NULL on text.
ALTER TABLE direct_messages ALTER COLUMN text DROP NOT NULL;
ALTER TABLE direct_messages ALTER COLUMN text SET DEFAULT '';

-- ---------------------------------------------------------------------------
-- 3. Read receipts — one cursor row per (conversation, user). Upserted when the
--    conversation is actually on-screen, so reads are O(1) writes, not per message.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_reads (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_message_id UUID,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reads_conversation ON message_reads(conversation_id);
ALTER TABLE message_reads REPLICA IDENTITY FULL;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER membership check reused by read-receipt and storage policies.
CREATE OR REPLACE FUNCTION is_conversation_member(p_conv UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = p_conv
      AND (
        c.organizer_user_id = auth.uid()
        OR c.participant_user_id = auth.uid()
        OR (c.is_group AND EXISTS (
          SELECT 1 FROM event_participants ep
          WHERE ep.event_id = c.event_id
            AND ep.user_id = auth.uid()
            AND ep.status = 'JOINED'
        ))
      )
  );
$$;
GRANT EXECUTE ON FUNCTION is_conversation_member(UUID) TO authenticated;

DROP POLICY IF EXISTS "Read cursors visible to conversation members" ON message_reads;
CREATE POLICY "Read cursors visible to conversation members" ON message_reads
  FOR SELECT TO authenticated USING (is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Users upsert their own read cursor" ON message_reads;
CREATE POLICY "Users upsert their own read cursor" ON message_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Users update their own read cursor" ON message_reads;
CREATE POLICY "Users update their own read cursor" ON message_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Organizer banner notifications — a priority on notifications. No new enum
--    value is needed; broadcasts reuse existing kinds and carry a priority.
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('NORMAL', 'ALERT', 'HIGH'));

-- Authorized fan-out of a banner to every JOINED participant of an event.
-- SECURITY DEFINER so one organizer can write notification rows addressed to
-- other users (notifications INSERT policy is WITH CHECK (true), but writing many
-- rows for arbitrary recipients is better centralized and authorization-checked).
CREATE OR REPLACE FUNCTION send_event_broadcast(
  p_event_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_priority TEXT DEFAULT 'NORMAL'
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ev events;
  v_actor profiles;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_ev FROM events WHERE id = p_event_id;
  IF v_ev.id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  -- Only the organizing team, the organizing club's President, or admins may broadcast.
  IF NOT (
    v_actor.id = v_ev.organizer_user_id
    OR v_actor.id = ANY(v_ev.co_organizer_user_ids)
    OR v_actor.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
    OR (v_actor.role = 'CLUB_PRESIDENT' AND v_actor.club_id = v_ev.organizing_club_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to broadcast to this event';
  END IF;

  IF p_priority NOT IN ('NORMAL', 'ALERT', 'HIGH') THEN
    RAISE EXCEPTION 'Invalid priority %', p_priority;
  END IF;
  IF length(coalesce(p_title, '')) = 0 OR length(p_title) > 120 THEN
    RAISE EXCEPTION 'Title must be 1-120 characters';
  END IF;
  IF length(coalesce(p_message, '')) > 1000 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  INSERT INTO notifications (user_id, kind, title, message, event_id, priority)
  SELECT ep.user_id, 'EVENT_UPDATE', p_title, p_message, p_event_id, p_priority
  FROM event_participants ep
  WHERE ep.event_id = p_event_id
    AND ep.status = 'JOINED'
    AND ep.user_id <> auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION send_event_broadcast(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Chat media Storage bucket (private) + membership-scoped policies.
--    Path convention: <conversation_id>/<user_id>/<filename>
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Chat media uploadable by conversation members" ON storage.objects;
CREATE POLICY "Chat media uploadable by conversation members" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Chat media readable by conversation members" ON storage.objects;
CREATE POLICY "Chat media readable by conversation members" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND is_conversation_member(((storage.foldername(name))[1])::uuid)
  );
