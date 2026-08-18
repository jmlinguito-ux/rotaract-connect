-- ============================================================================
-- 0017 — @mentions in group chat + idempotent push delivery
-- ============================================================================
-- Two additions:
--
-- 1. `mentioned_user_ids` on direct_messages. Mentions are stored as USER IDS, not
--    parsed out of the message text at send time: display names are neither unique
--    nor stable, so text parsing would mis-target people and would break the moment
--    someone renames themselves. The composer resolves the id when the mention is
--    inserted; the server only ever trusts this column.
--
-- 2. `push_deliveries`, a dedupe ledger. Database webhooks are at-least-once — a
--    retry or a double-fire would otherwise buzz everyone twice for one message.
--    send-push claims a key here BEFORE sending; a conflict means someone already
--    delivered it and this invocation stops.
--
-- Additive and idempotent — safe to re-run.

ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS mentioned_user_ids UUID[] NOT NULL DEFAULT '{}';

-- GIN so "messages mentioning me" stays cheap as history grows.
CREATE INDEX IF NOT EXISTS idx_direct_messages_mentions
  ON direct_messages USING GIN (mentioned_user_ids);

CREATE TABLE IF NOT EXISTS push_deliveries (
  dedupe_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The ledger only needs to answer "did we already send this, recently?" — an
-- unbounded table would grow forever for no benefit.
CREATE INDEX IF NOT EXISTS idx_push_deliveries_created ON push_deliveries(created_at);

CREATE OR REPLACE FUNCTION prune_push_deliveries()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM push_deliveries WHERE created_at < now() - interval '3 days';
$$;

-- Only the service role touches this table; no client ever reads or writes it.
ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('prune-push-deliveries')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-push-deliveries');
    PERFORM cron.schedule('prune-push-deliveries', '17 4 * * *', 'SELECT prune_push_deliveries();');
  END IF;
END $$;
