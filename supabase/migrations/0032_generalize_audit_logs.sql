-- Migration 0032: Generalize audit_logs beyond verification applications.
--
-- audit_logs was created for ONE purpose: recording verification-application
-- reviews. The app has since grown a general-purpose audit trail (see
-- AuditLogsScreen and the AuditLog type) that also records ROLE changes, EVENT
-- approvals/cancellations and ATTENDANCE marking. Those writes fail today:
-- PostgREST rejects the unknown `category` column first, and even with it added
-- the NOT NULL application_id and the verification_status-typed status columns
-- would reject every non-verification row.
--
-- All changes are additive or constraint-relaxing; no existing row is altered.

-- 1. Columns the AuditLog type already sends.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_name TEXT;

-- 2. Only VERIFICATION rows have an application; ROLE/EVENT/ATTENDANCE do not.
ALTER TABLE public.audit_logs
  ALTER COLUMN application_id DROP NOT NULL;

-- 3. previous_status/new_status were typed `verification_status`, but the other
--    categories record event statuses ('CANCELLED'), positions ('Member') and
--    attendance states ('ATTENDED') — none of which are enum members. Widen to
--    TEXT; existing enum values cast cleanly and the review_application RPCs
--    keep working via the enum -> text assignment cast.
ALTER TABLE public.audit_logs
  ALTER COLUMN previous_status TYPE TEXT USING previous_status::text,
  ALTER COLUMN new_status      TYPE TEXT USING new_status::text;

-- 4. The app treats both as optional on the AuditLog type.
ALTER TABLE public.audit_logs
  ALTER COLUMN previous_status DROP NOT NULL,
  ALTER COLUMN new_status      DROP NOT NULL;

-- 5. Constrain category to the values the client actually emits.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_category_check'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_category_check
      CHECK (category IS NULL OR category IN ('ROLE', 'EVENT', 'VERIFICATION', 'ATTENDANCE', 'SYSTEM'));
  END IF;
END $$;

-- 6. AuditLogsScreen filters by category and lists newest-first.
CREATE INDEX IF NOT EXISTS idx_audit_logs_category_created_at
  ON public.audit_logs (category, created_at DESC);
