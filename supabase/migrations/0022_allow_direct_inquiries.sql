-- ============================================================================
-- 0022 — "Allow direct inquiries" becomes a real, enforced privacy setting
-- ============================================================================
-- The Settings toggle existed but was local component state: it persisted nowhere
-- and nothing read it. This is necessarily a PROFILE column rather than a local
-- preference — the setting governs what OTHER people may do, so their client (and
-- the database) has to be able to read it. A device-local flag could never enforce
-- anything.
--
-- When off, only members of the same club may open a new conversation with the
-- user. Existing threads are unaffected: this gates who may START an inquiry, which
-- is what the setting says, and silently cutting off established conversations
-- would be a surprise.
--
-- Enforced in the database, not only in the UI: hiding a button stops the honest
-- path, not a crafted request.
--
-- Idempotent — safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allow_direct_inquiries BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.allow_direct_inquiries IS
  'When false, only same-club members may start a new 1-on-1 conversation with this user.';

-- Rebuild the conversations INSERT policy with the inquiry rule folded in.
DROP POLICY IF EXISTS "Conversations insertable by participants" ON conversations;

CREATE POLICY "Conversations insertable by participants" ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      NOT is_group
      AND (auth.uid() = participant_user_id OR auth.uid() = organizer_user_id)
      AND (
        SELECT COALESCE(bool_and(ok), true) FROM (
          SELECT
            p.allow_direct_inquiries
            OR p.id = auth.uid()                          -- never gate yourself
            OR p.club_id IS NOT DISTINCT FROM (SELECT club_id FROM profiles WHERE id = auth.uid())
            OR EXISTS (                                    -- admins are never blocked
              SELECT 1 FROM profiles me
              WHERE me.id = auth.uid() AND me.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
            ) AS ok
          FROM profiles p
          WHERE p.id IN (participant_user_id, organizer_user_id)
        ) checks
      )
    )
    OR (
      is_group
      AND participant_user_id IS NULL
      AND (
        auth.uid() = organizer_user_id
        OR EXISTS (
          SELECT 1 FROM event_participants ep
          WHERE ep.event_id = conversations.event_id
            AND ep.user_id = auth.uid()
            AND ep.status = 'JOINED'
        )
      )
    )
  );
