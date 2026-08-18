-- ============================================================================
-- 0020 — approve_event(): make a President's approval actually persist
-- ============================================================================
-- An approval by any President other than the ORGANISING club's was silently
-- discarded. The UPDATE policy on events allows a CLUB_PRESIDENT only when
-- `p.club_id = organizing_club_id`, but the approval model requires sign-off from
-- every involved club — organiser, participating clubs, and each co-organiser's
-- club. Those Presidents pass the client-side canApproveEvent check, tap Approve,
-- and the write matches zero rows.
--
-- Critically this failed SILENTLY: an RLS USING violation on UPDATE is not an
-- error, it simply updates nothing. The optimistic local state showed "approved"
-- until the next sign-in refetched the truth.
--
-- Fixed with a SECURITY DEFINER RPC rather than by widening the UPDATE policy: a
-- partner club's President must be able to APPROVE an event, not to edit its title,
-- dates or venue. This grants exactly the one operation, and re-derives the approver
-- set server-side so the client cannot assert its way past authorisation.
--
-- Mirrors approverClubIdsFor() in src/utils/eventApproval.ts. Re-runnable.

CREATE OR REPLACE FUNCTION approve_event(p_event_id UUID)
RETURNS events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor profiles;
  v_ev events;
  v_approver_clubs UUID[];
  v_approved UUID[];
BEGIN
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_ev FROM events WHERE id = p_event_id;
  IF v_ev.id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  -- Idempotent: approving an already-published event is a no-op, not an error, so a
  -- double tap or a retry cannot corrupt state.
  IF v_ev.status <> 'PENDING_APPROVAL' THEN RETURN v_ev; END IF;

  IF v_ev.event_type = 'DISTRICT_EVENT' THEN
    IF v_actor.role NOT IN ('DISTRICT_ADMIN', 'APP_ADMIN') THEN
      RAISE EXCEPTION 'Only a District Administrator can approve a District Event';
    END IF;
    UPDATE events SET status = 'RECRUITING' WHERE id = p_event_id RETURNING * INTO v_ev;
    RETURN v_ev;
  END IF;

  -- Every club with skin in the game: organiser, partners, co-organisers' clubs.
  SELECT ARRAY(
    SELECT DISTINCT c FROM unnest(
      ARRAY[v_ev.organizing_club_id]
      || COALESCE(ARRAY(SELECT club_id FROM event_participating_clubs WHERE event_id = p_event_id), '{}')
      || COALESCE(ARRAY(SELECT club_id FROM profiles WHERE id = ANY(v_ev.co_organizer_user_ids) AND club_id IS NOT NULL), '{}')
    ) AS c WHERE c IS NOT NULL
  ) INTO v_approver_clubs;

  IF v_actor.role IN ('DISTRICT_ADMIN', 'APP_ADMIN') THEN
    -- Admins can unblock a stalled approval outright.
    v_approved := v_approver_clubs;
  ELSIF v_actor.role = 'CLUB_PRESIDENT' AND v_actor.club_id = ANY(v_approver_clubs) THEN
    v_approved := ARRAY(
      SELECT DISTINCT u FROM unnest(COALESCE(v_ev.approved_by_club_ids, '{}') || v_actor.club_id) AS u
    );
  ELSE
    RAISE EXCEPTION 'You are not an approver for this event';
  END IF;

  UPDATE events
    SET approved_by_club_ids = v_approved,
        status = CASE
          WHEN NOT EXISTS (SELECT 1 FROM unnest(v_approver_clubs) AS c WHERE c <> ALL(v_approved))
          THEN 'RECRUITING'::event_status
          ELSE status
        END
    WHERE id = p_event_id
    RETURNING * INTO v_ev;

  RETURN v_ev;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_event(UUID) TO authenticated;
