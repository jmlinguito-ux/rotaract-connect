-- ============================================================================
-- 0021 — Let the organising team enrol participants, not just themselves
-- ============================================================================
-- event_participants had an asymmetric policy set: the organising team could
-- UPDATE and DELETE any participant row on their event, but INSERT was restricted
-- to `auth.uid() = user_id` — self-enrolment only.
--
-- The app auto-enrols the organising team when an event is saved, so adding a
-- co-organiser writes a row carrying THEIR user_id and the check rejected it:
--   new row violates row-level security policy for table "event_participants"
--
-- This grants INSERT to exactly the people who can already UPDATE and DELETE those
-- same rows, so it is closing an inconsistency rather than widening authority. An
-- organiser who can already flip someone's attendance or remove them from the event
-- gains nothing new by also being able to add them.
--
-- Idempotent — safe to re-run.

DROP POLICY IF EXISTS "Users can join events" ON event_participants;
DROP POLICY IF EXISTS "Participants insertable by self or organizing team" ON event_participants;

CREATE POLICY "Participants insertable by self or organizing team"
  ON event_participants FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_participants.event_id
        AND (
          e.organizer_user_id = auth.uid()
          OR auth.uid() = ANY(e.co_organizer_user_ids)
        )
    )
    -- Admins manage events across the district and hit the same enrolment paths.
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
    )
  );
