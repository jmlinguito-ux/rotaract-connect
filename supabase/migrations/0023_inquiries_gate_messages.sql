-- ============================================================================
-- 0023 — "Allow direct inquiries" also gates messages in EXISTING threads
-- ============================================================================
-- 0022 gated conversation CREATION only, so anyone who already had a thread could
-- keep messaging after the setting was turned off. That reads as the setting not
-- working: a member switches it off and the same people carry on regardless.
--
-- This extends the rule to direct_messages. Sending a 1-on-1 message to someone who
-- has inquiries off now requires being in their club, or being an admin.
--
-- Deliberately narrow:
--   * group chats are untouched — event membership already gates those
--   * only INBOUND messages are restricted, so the person who turned the setting
--     off can still reply to anyone; their own threads are never frozen
--
-- Rebuilds "Messages insertable by sender" from schema.sql, keeping its original
-- membership conditions verbatim and adding the inquiry check. Written as a full
-- replacement rather than a second policy because multiple INSERT policies OR
-- together — a separate policy would widen access instead of narrowing it.
--
-- Idempotent — safe to re-run.

DROP POLICY IF EXISTS "Messages insertable by sender" ON direct_messages;
DROP POLICY IF EXISTS "Messages insertable respecting inquiry setting" ON direct_messages;

CREATE POLICY "Messages insertable respecting inquiry setting" ON direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = direct_messages.conversation_id
        AND (
          auth.uid() = c.organizer_user_id
          OR auth.uid() = c.participant_user_id
          OR (c.is_group AND EXISTS (
            SELECT 1 FROM event_participants ep
            WHERE ep.event_id = c.event_id
              AND ep.user_id = auth.uid()
              AND ep.status = 'JOINED'
          ))
        )
    )
    AND (
      receiver_id IS NULL                -- group message: no single recipient
      OR receiver_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles target
        WHERE target.id = receiver_id
          AND (
            target.allow_direct_inquiries
            OR target.club_id IS NOT DISTINCT FROM (SELECT club_id FROM profiles WHERE id = auth.uid())
            OR EXISTS (
              SELECT 1 FROM profiles me
              WHERE me.id = auth.uid() AND me.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
            )
          )
      )
    )
  );
