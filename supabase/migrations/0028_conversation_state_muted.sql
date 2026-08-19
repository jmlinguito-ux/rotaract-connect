-- ============================================================================
-- 0028 — Add muted flag to conversation_states
-- ============================================================================
-- Allows users to mute individual conversations (group chats or DMs).
-- Muted conversations suppress standard push notifications while still
-- allowing direct @mentions and urgent organizer alerts to pierce through.

ALTER TABLE conversation_states
  ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false;
