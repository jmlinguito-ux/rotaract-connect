-- Migration 0035: District Area Admin — a District Admin scoped to one Zone.
--
-- Same powers as a District Admin (event approval, application review, role
-- management) but only over clubs in their own Zone. The Zone is derived from
-- their club's zone_id rather than a new profiles.zone_id column, so an area
-- admin governs the Zone their club belongs to.
--
-- NOT granted: signing the District Rotaract Representative line on certificates.
-- That signature represents the District as a whole and stays with DISTRICT_ADMIN.
--
-- NOTE: adding an enum value is NOT reversible — Postgres has no DROP VALUE. The
-- value can also not be used in the same transaction that adds it, which is why
-- nothing here inserts or compares against it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'DISTRICT_AREA_ADMIN'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'DISTRICT_AREA_ADMIN';
  END IF;
END $$;

-- system_role is a TEXT column with a CHECK, so it just needs widening.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_system_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_system_role_check
  CHECK (system_role IN ('APP_ADMIN', 'DISTRICT_ADMIN', 'DISTRICT_AREA_ADMIN', 'NONE'));
