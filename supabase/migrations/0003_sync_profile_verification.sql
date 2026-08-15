-- Data repair: promote profiles to VERIFIED where their application is VERIFIED.
--
-- Approvals made before review_application existed updated the application row
-- but not the applicant's profile (profiles RLS blocked cross-user updates), so
-- verified members show no check badge. This backfills them. Idempotent.
UPDATE profiles p
SET verification_status = 'VERIFIED'
FROM verification_applications va
WHERE va.user_id = p.id
  AND va.status = 'VERIFIED'
  AND p.verification_status IS DISTINCT FROM 'VERIFIED';
