-- ============================================================================
-- 0010 — "Delete for everyone" (unsend) with a tombstone
-- ============================================================================
-- Unsending keeps the row (so it stays a single shared record and realtime can
-- deliver the change) but clears its content and stamps deleted_at. Clients then
-- render it as "This message was deleted". Only the original sender may unsend.
-- direct_messages already has REPLICA IDENTITY FULL (migration 0007), so the
-- UPDATE streams the full row to every participant.

ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION unsend_message(p_message_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_msg direct_messages;
BEGIN
  SELECT * INTO v_msg FROM direct_messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN RAISE EXCEPTION 'Message not found'; END IF;
  IF v_msg.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only unsend your own messages';
  END IF;
  UPDATE direct_messages
    SET deleted_at = NOW(), text = '', attachment_path = NULL, attachment_type = NULL
    WHERE id = p_message_id;
END;
$$;
GRANT EXECUTE ON FUNCTION unsend_message(UUID) TO authenticated;
