-- ============================================================================
-- 0019 — Realtime for the remaining app tables
-- ============================================================================
-- Twelve tables were already published; these four were not, and their absence was
-- silent: a client can subscribe to any table, but if it is not in the publication
-- the channel simply never fires. Nothing errors, nothing logs, the screen just
-- stops updating.
--
-- Why these four matter:
--   clubs                     — president_id decides WHO must approve an event, so a
--                               change here changes the approver set
--   event_participating_clubs — decides WHICH clubs must approve, same reason
--   zones                     — reference data; tiny, and stale zones misfile clubs
--   audit_logs                — rendered by auditFor() on the application review screen
--
-- Deliberately NOT published: push_tokens and push_deliveries. No UI reads them, so
-- publishing would spend WAL and socket traffic on rows nothing renders. Realtime is
-- not free — every published change is replicated and evaluated against RLS for each
-- subscriber — so "publish everything" is a cost, not a default.
--
-- Idempotent — safe to re-run.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clubs', 'zones', 'event_participating_clubs', 'audit_logs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Without FULL, an UPDATE or DELETE payload carries only the primary key and the
-- changed columns, which is not enough for a client to identify what it should drop.
ALTER TABLE clubs REPLICA IDENTITY FULL;
ALTER TABLE zones REPLICA IDENTITY FULL;
ALTER TABLE event_participating_clubs REPLICA IDENTITY FULL;
ALTER TABLE audit_logs REPLICA IDENTITY FULL;
