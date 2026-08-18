-- ============================================================================
-- 0014 — Wire EVENT_REMINDER: scheduled reminders at T-24h and T-1h
-- ============================================================================
-- The EVENT_REMINDER notification kind existed but nothing ever produced it. This
-- adds a scheduled job that, for each upcoming active event, notifies every JOINED
-- participant ~24h and ~1h before it starts. Those notification rows then fan out
-- as push via the existing send-push webhook — the highest-value use of the push
-- infrastructure. Idempotent; safe to re-run.
--
-- Requires the pg_cron + pg_net extensions (pg_net already used by the webhook).

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Per-event flags so each reminder is sent at most once.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ;

-- Emits due reminders. SECURITY DEFINER so it runs as the owner: exempt from the
-- notification rate-limit trigger and RLS, and able to write rows for many users.
CREATE OR REPLACE FUNCTION send_event_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ev events;
  v_total integer := 0;
BEGIN
  -- ---- T-24h reminders: events starting within the next 24h, not yet reminded.
  FOR v_ev IN
    SELECT * FROM events
    WHERE reminder_24h_sent_at IS NULL
      AND status NOT IN ('CANCELLED', 'COMPLETED', 'DRAFT', 'PENDING_APPROVAL')
      AND start_datetime > now()
      AND start_datetime <= now() + interval '24 hours'
  LOOP
    INSERT INTO notifications (user_id, kind, title, message, event_id, priority)
    SELECT ep.user_id, 'EVENT_REMINDER', 'Event tomorrow: ' || v_ev.title,
           '"' || v_ev.title || '" starts within 24 hours. Tap for details.',
           v_ev.id, 'NORMAL'
    FROM event_participants ep
    WHERE ep.event_id = v_ev.id AND ep.status = 'JOINED';
    GET DIAGNOSTICS v_total = v_total + ROW_COUNT;
    UPDATE events SET reminder_24h_sent_at = now() WHERE id = v_ev.id;
  END LOOP;

  -- ---- T-1h reminders: events starting within the next hour, not yet reminded.
  FOR v_ev IN
    SELECT * FROM events
    WHERE reminder_1h_sent_at IS NULL
      AND status NOT IN ('CANCELLED', 'COMPLETED', 'DRAFT', 'PENDING_APPROVAL')
      AND start_datetime > now()
      AND start_datetime <= now() + interval '1 hour'
  LOOP
    INSERT INTO notifications (user_id, kind, title, message, event_id, priority)
    SELECT ep.user_id, 'EVENT_REMINDER', 'Starting soon: ' || v_ev.title,
           '"' || v_ev.title || '" starts within the hour. See you there!',
           v_ev.id, 'ALERT'
    FROM event_participants ep
    WHERE ep.event_id = v_ev.id AND ep.status = 'JOINED';
    GET DIAGNOSTICS v_total = v_total + ROW_COUNT;
    UPDATE events SET reminder_1h_sent_at = now() WHERE id = v_ev.id;
  END LOOP;

  RETURN v_total;
END;
$$;

-- Run every 15 minutes. Re-scheduling with the same name replaces the old entry.
SELECT cron.unschedule('event-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'event-reminders'
);
SELECT cron.schedule('event-reminders', '*/15 * * * *', $$ SELECT send_event_reminders(); $$);
