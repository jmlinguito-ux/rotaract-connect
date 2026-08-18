-- ============================================================================
-- 0012 — Expo push tokens for OS notifications (foreground/background/closed)
-- ============================================================================
-- Stores one Expo push token per device per user. The client registers a token
-- when push is enabled (device permission granted + the in-app Push setting on)
-- and DELETES it when the user turns push off — so respecting the preference is a
-- matter of token presence, and the sender never has to read a client-only flag.
--
-- The Edge Function `send-push` reads these rows with the service role (bypassing
-- RLS) on each new notification; users themselves only ever touch their own rows.
-- Additive and idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,                 -- Expo push token; unique per device
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform TEXT,                          -- 'ios' | 'android' | 'web'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- A user only ever sees/creates/updates/removes their OWN device tokens.
DROP POLICY IF EXISTS "Own push tokens are visible" ON push_tokens;
CREATE POLICY "Own push tokens are visible" ON push_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users register their own push token" ON push_tokens;
CREATE POLICY "Users register their own push token" ON push_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update their own push token" ON push_tokens;
CREATE POLICY "Users update their own push token" ON push_tokens
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users remove their own push token" ON push_tokens;
CREATE POLICY "Users remove their own push token" ON push_tokens
  FOR DELETE TO authenticated USING (user_id = auth.uid());
