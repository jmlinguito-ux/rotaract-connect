-- Fix: grant DML privileges on push tables to the authenticated role.
-- The original migration (0027) only granted REFERENCES/TRIGGER/TRUNCATE/MAINTAIN,
-- omitting SELECT/INSERT/UPDATE/DELETE, which caused the RLS WITH CHECK to fail
-- with "42501 insufficient_privilege" even though the RLS policy itself was correct.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_deliveries   TO authenticated;

-- service_role already bypasses RLS, but grant explicitly for clarity.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_deliveries   TO service_role;
