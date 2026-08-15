-- ============================================================================
-- 0008 — Organizer broadcasts post into the event group chat
-- ============================================================================
-- Upgrades send_event_broadcast so an announcement:
--   * is posted as a message in the event's group conversation (creating it if
--     it does not exist yet), and
--   * notifies every JOINED participant with the notification linked to that
--     group conversation, so tapping it in the Inbox opens the group chat.
-- Re-runnable (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION send_event_broadcast(
  p_event_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_priority TEXT DEFAULT 'NORMAL'
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ev events;
  v_actor profiles;
  v_conv_id UUID;
  v_body TEXT;
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

  -- Find (or lazily create) the event's single group conversation.
  SELECT id INTO v_conv_id FROM conversations WHERE event_id = p_event_id AND is_group LIMIT 1;
  IF v_conv_id IS NULL THEN
    INSERT INTO conversations (event_id, event_title, is_group, participant_user_id, organizer_user_id, last_message, last_message_at)
    VALUES (p_event_id, v_ev.title, true, NULL, v_ev.organizer_user_id, '', NOW())
    RETURNING id INTO v_conv_id;
  END IF;

  v_body := CASE WHEN length(coalesce(p_message, '')) > 0 THEN p_title || E'\n' || p_message ELSE p_title END;

  -- Post the announcement into the group chat (prefixed so it reads as a banner).
  INSERT INTO direct_messages (conversation_id, event_id, sender_id, receiver_id, text)
  VALUES (v_conv_id, p_event_id, auth.uid(), NULL, '📢 ' || v_body);
  UPDATE conversations SET last_message = '📢 ' || p_title, last_message_at = NOW() WHERE id = v_conv_id;

  -- Notify every JOINED participant, linking the notification to the group chat.
  INSERT INTO notifications (user_id, kind, title, message, event_id, conversation_id, priority)
  SELECT ep.user_id, 'EVENT_UPDATE', p_title, coalesce(nullif(p_message, ''), p_title), p_event_id, v_conv_id, p_priority
  FROM event_participants ep
  WHERE ep.event_id = p_event_id
    AND ep.status = 'JOINED'
    AND ep.user_id <> auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION send_event_broadcast(UUID, TEXT, TEXT, TEXT) TO authenticated;
