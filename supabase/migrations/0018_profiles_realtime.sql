-- ============================================================================
-- 0018 — Live profile changes (role, verification, club)
-- ============================================================================
-- A member's role was frozen at sign-in: AuthContext fetched the profile once and
-- nothing ever refetched it, and `profiles` was not in the realtime publication, so
-- promoting someone to President or approving their verification had no visible
-- effect until they signed out and back in.
--
-- Adding profiles to the publication lets the affected user's own session update the
-- moment the row changes. Realtime enforces RLS per subscriber, and the SELECT policy
-- on profiles is `USING (true)` for authenticated users, so this exposes nothing that
-- was not already readable through an ordinary query.
--
-- Idempotent — safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
  END IF;
END $$;

-- UPDATE payloads carry only the changed columns unless the row is replicated in
-- full; the client re-reads the profile on any change, but FULL keeps the payload
-- self-describing for anything that wants to merge directly.
ALTER TABLE profiles REPLICA IDENTITY FULL;
