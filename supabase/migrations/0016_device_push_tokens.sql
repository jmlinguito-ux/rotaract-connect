-- ============================================================================
-- 0016 — Raw FCM device tokens, so Android push can be data-only
-- ============================================================================
-- Android chat notifications are rendered by native Kotlin (MessagingStyle, avatar,
-- inline reply). That code only runs if FCM hands the message to the app — and per
-- Firebase's delivery rules it only does that for DATA-ONLY messages. The Expo push
-- service always includes a `notification` block, so on a backgrounded or terminated
-- app the system tray drew a generic notification and our builder was never called.
--
-- Fix: send to Android directly via FCM v1 with data only, which requires the raw
-- device token (Notifications.getDevicePushTokenAsync) rather than the Expo token.
-- iOS is unchanged and keeps going through the Expo push service.
--
-- Additive and idempotent — safe to re-run.

ALTER TABLE push_tokens
  ADD COLUMN IF NOT EXISTS device_token TEXT;

CREATE INDEX IF NOT EXISTS idx_push_tokens_device ON push_tokens(device_token);

COMMENT ON COLUMN push_tokens.device_token IS
  'Raw FCM registration token (Android only). Null on iOS, which delivers via Expo/APNs.';
