-- ============================================================================
-- 0024 — create_event_with_clubs() RPC & direct_messages dimension columns
-- ============================================================================
-- 1. Adds attachment_width and attachment_height to direct_messages to pre-reserve
--    space in chat lists and prevent layout shifts during image loading.
--
-- 2. Atomically inserts an event and its participating clubs in a single database
--    transaction. If either operation fails, PostgreSQL rolls back the entire
--    operation so orphaned events or partial participating club rows cannot exist.

ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS attachment_width INTEGER,
  ADD COLUMN IF NOT EXISTS attachment_height INTEGER;

DROP FUNCTION IF EXISTS create_event_with_clubs(JSONB, UUID[]);
DROP FUNCTION IF EXISTS create_event_with_clubs;

CREATE OR REPLACE FUNCTION create_event_with_clubs(
  p_event JSONB,
  p_participating_club_ids UUID[] DEFAULT '{}'
)
RETURNS events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor profiles;
  v_ev events;
  v_club_id UUID;
BEGIN
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert the event row populated from jsonb fields
  INSERT INTO events (
    id,
    title,
    description,
    event_type,
    status,
    start_datetime,
    end_datetime,
    latitude,
    longitude,
    address,
    city,
    organizing_club_id,
    organizer_user_id,
    co_organizer_user_ids,
    max_participants,
    requires_approval,
    allow_participant_invites,
    visibility,
    cover_photo,
    contact_number,
    contact_email,
    areas_of_focus,
    lock_leave_cutoff_hours,
    approved_by_club_ids
  ) VALUES (
    COALESCE((p_event->>'id')::UUID, gen_random_uuid()),
    p_event->>'title',
    COALESCE(p_event->>'description', ''),
    (p_event->>'event_type')::event_type,
    COALESCE((p_event->>'status')::event_status, 'DRAFT'::event_status),
    (p_event->>'start_datetime')::TIMESTAMPTZ,
    (p_event->>'end_datetime')::TIMESTAMPTZ,
    (p_event->>'latitude')::DOUBLE PRECISION,
    (p_event->>'longitude')::DOUBLE PRECISION,
    p_event->>'address',
    COALESCE(p_event->>'city', ''),
    (p_event->>'organizing_club_id')::UUID,
    (p_event->>'organizer_user_id')::UUID,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_event->'co_organizer_user_ids')::UUID), '{}'),
    COALESCE((p_event->>'max_participants')::INTEGER, 0),
    COALESCE((p_event->>'requires_approval')::BOOLEAN, false),
    COALESCE((p_event->>'allow_participant_invites')::BOOLEAN, true),
    COALESCE((p_event->>'visibility')::event_visibility, 'VERIFIED_ROTARACTORS'::event_visibility),
    p_event->>'cover_photo',
    p_event->>'contact_number',
    p_event->>'contact_email',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_event->'areas_of_focus')::area_of_focus), '{}'),
    COALESCE((p_event->>'lock_leave_cutoff_hours')::INTEGER, 24),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_event->'approved_by_club_ids')::UUID), '{}')
  )
  RETURNING * INTO v_ev;

  -- Insert participating clubs if provided
  IF p_participating_club_ids IS NOT NULL AND array_length(p_participating_club_ids, 1) > 0 THEN
    FOREACH v_club_id IN ARRAY p_participating_club_ids LOOP
      IF v_club_id IS NOT NULL THEN
        INSERT INTO event_participating_clubs (event_id, club_id)
        VALUES (v_ev.id, v_club_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_ev;
END;
$$;

GRANT EXECUTE ON FUNCTION create_event_with_clubs(JSONB, UUID[]) TO authenticated;
