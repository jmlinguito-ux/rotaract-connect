-- ============================================================================
-- 0013 — Lock down notification inserts (attribution + rate limiting)
-- ============================================================================
-- Before this, `notifications` INSERT was `WITH CHECK (true)`: ANY authenticated
-- user could write a notification to ANY user, anonymously. Now that push fans
-- out from this table, that was a spam/phishing vector straight to lock screens.
--
-- The app legitimately needs cross-user inserts (DM → notify recipient, invite →
-- notify invitee, join request → notify organizer), so we can't restrict to self.
-- Instead:
--   1. Every notification records an UNFORGEABLE `created_by = auth.uid()`, so a
--      malicious or spoofed notification is always traceable to its author.
--   2. A rate-limit trigger throttles direct client inserts (per author), while
--      authorized SECURITY DEFINER fan-outs (send_event_broadcast) — which run as
--      the table owner, not `authenticated` — are exempt.
-- No client change is required: the column defaults server-side and the existing
-- insert path keeps working. Additive and idempotent.

-- ---------------------------------------------------------------------------
-- 1. Attribution: who created each notification (unforgeable via the policy).
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by, created_at);

-- Replace the wide-open policy: an author may insert notifications for anyone, but
-- only stamped as THEMSELVES. Providing someone else's id (or NULL) as created_by
-- fails the check. Client inserts omit the column, so the default applies and this
-- passes. SECURITY DEFINER RPCs run as the owner and bypass RLS entirely.
DROP POLICY IF EXISTS "Notifications insertable by system" ON notifications;
DROP POLICY IF EXISTS "Notifications insertable with attributable creator" ON notifications;
CREATE POLICY "Notifications insertable with attributable creator" ON notifications
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Rate limit direct client inserts (anti-spam). Authorized server fan-outs
--    run as the table owner (current_user <> 'authenticated') and are exempt, so
--    a legitimate broadcast to a large event is never throttled.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_notification_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  IF current_user = 'authenticated' THEN
    SELECT count(*) INTO v_count
    FROM notifications
    WHERE created_by = auth.uid()
      AND created_at > now() - interval '1 minute';
    IF v_count >= 150 THEN
      RAISE EXCEPTION 'Notification rate limit exceeded — please slow down.'
        USING errcode = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_rate_limit ON notifications;
CREATE TRIGGER trg_notification_rate_limit
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION enforce_notification_rate_limit();
