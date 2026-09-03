-- Migration 0036: Teach the database about District Area Admins.
--
-- 0035 added the role; without this the client would offer an Area Admin every
-- District Admin action and the database would reject each one, because every
-- policy tests `role IN ('DISTRICT_ADMIN','APP_ADMIN')` literally.
--
-- governs_club() is the SQL twin of canGovernClub() in src/utils/roles.ts — keep
-- the two in step. It fails CLOSED: an Area Admin whose Zone cannot be resolved
-- (no club, or a club with no zone_id) governs nothing.
--
-- Runs in a separate migration from the ALTER TYPE that created the enum value:
-- Postgres forbids using a new enum value in the transaction that adds it.

CREATE OR REPLACE FUNCTION public.governs_club(p_user UUID, p_club UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role IN ('APP_ADMIN', 'DISTRICT_ADMIN') THEN true
    WHEN p.role = 'DISTRICT_AREA_ADMIN' THEN EXISTS (
      SELECT 1
      FROM clubs target
      JOIN clubs own ON own.id = p.club_id
      WHERE target.id = p_club
        AND target.zone_id IS NOT NULL
        AND target.zone_id = own.zone_id
    )
    ELSE false
  END
  FROM profiles p
  WHERE p.id = p_user;
$$;

-- Events may be edited by an Area Admin governing the organizing club. Mirrors 0033
-- (guard in USING, authorization-only in WITH CHECK so terminal states stay reachable).
DROP POLICY IF EXISTS "Events updatable by organizers or presidents" ON public.events;

CREATE POLICY "Events updatable by organizers or presidents" ON public.events
  FOR UPDATE TO authenticated
  USING (
    status NOT IN ('COMPLETED', 'CANCELLED')
    AND (
      auth.uid() = organizer_user_id
      OR auth.uid() = ANY(co_organizer_user_ids)
      OR public.governs_club(auth.uid(), organizing_club_id)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'CLUB_PRESIDENT'
          AND p.club_id = organizing_club_id
      )
    )
  )
  WITH CHECK (
    auth.uid() = organizer_user_id
    OR auth.uid() = ANY(co_organizer_user_ids)
    OR public.governs_club(auth.uid(), organizing_club_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'CLUB_PRESIDENT'
        AND p.club_id = organizing_club_id
    )
  );

-- approve_event: let a District Area Admin unblock a stalled approval for a club in
-- their Zone. Body is 0020's, with the admin branch widened via governs_club().
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

  IF v_ev.status <> 'PENDING_APPROVAL' THEN RETURN v_ev; END IF;

  -- A District Event is district-wide, so an Area Admin cannot approve it.
  IF v_ev.event_type = 'DISTRICT_EVENT' THEN
    IF v_actor.role NOT IN ('DISTRICT_ADMIN', 'APP_ADMIN') THEN
      RAISE EXCEPTION 'Only a District Administrator can approve a District Event';
    END IF;
    UPDATE events SET status = 'RECRUITING' WHERE id = p_event_id RETURNING * INTO v_ev;
    RETURN v_ev;
  END IF;

  -- Approvers = organizing club + the clubs of co-organizers / team members.
  -- Co-hosting partner clubs (event_participating_clubs) are intentionally NOT
  -- included: they lend their name without staffing the event, so requiring their
  -- President let a club stall an event it was not responsible for. Must stay in
  -- step with approverClubIdsFor() in src/utils/eventApproval.ts.
  SELECT ARRAY(
    SELECT DISTINCT c FROM unnest(
      ARRAY[v_ev.organizing_club_id]
      || COALESCE(ARRAY(SELECT club_id FROM profiles WHERE id = ANY(v_ev.co_organizer_user_ids) AND club_id IS NOT NULL), '{}')
    ) AS c WHERE c IS NOT NULL
  ) INTO v_approver_clubs;

  IF public.governs_club(auth.uid(), v_ev.organizing_club_id) THEN
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
