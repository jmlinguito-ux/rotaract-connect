-- Migration 0033: Allow events to be CANCELLED / COMPLETED.
--
-- The UPDATE policy was written with a USING clause and no WITH CHECK:
--
--   USING (status NOT IN ('COMPLETED','CANCELLED') AND <authorized>)
--
-- When WITH CHECK is omitted, PostgreSQL reuses USING for it, so the NEW row was
-- also required to satisfy `status NOT IN ('COMPLETED','CANCELLED')`. The guard
-- is correct for the OLD row (you may not edit a finished event) but applied to
-- the new row it makes the CANCELLED/COMPLETED transitions unreachable:
--   "new row violates row-level security policy for table events".
--
-- Approving an event was unaffected only because it goes through the
-- approve_event() SECURITY DEFINER RPC (migration 0020), which bypasses RLS.
--
-- Fix: keep the guard in USING, and give WITH CHECK the authorization test ALONE
-- so a permitted actor may move an event into a terminal state. Authorization is
-- unchanged — this does not widen who can edit an event.

DROP POLICY IF EXISTS "Events updatable by organizers or presidents" ON public.events;

CREATE POLICY "Events updatable by organizers or presidents" ON public.events
  FOR UPDATE TO authenticated
  -- OLD row: a finished event stays frozen.
  USING (
    status NOT IN ('COMPLETED', 'CANCELLED')
    AND (
      auth.uid() = organizer_user_id
      OR auth.uid() = ANY(co_organizer_user_ids)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            p.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
            OR (p.role = 'CLUB_PRESIDENT' AND p.club_id = organizing_club_id)
          )
      )
    )
  )
  -- NEW row: authorization only, so CANCELLED/COMPLETED are reachable.
  WITH CHECK (
    auth.uid() = organizer_user_id
    OR auth.uid() = ANY(co_organizer_user_ids)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
          OR (p.role = 'CLUB_PRESIDENT' AND p.club_id = organizing_club_id)
        )
    )
  );
