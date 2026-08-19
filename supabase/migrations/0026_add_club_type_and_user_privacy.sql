-- ====================================================================
-- MIGRATION 0026: Add Club Charter Classification & User Contact Privacy
-- ====================================================================

-- 1. Add club classification columns to clubs table
ALTER TABLE clubs
ADD COLUMN IF NOT EXISTS club_type TEXT DEFAULT 'COMMUNITY_BASED',
ADD COLUMN IF NOT EXISTS institution_name TEXT;

-- 2. Add contact privacy preference to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS contact_privacy TEXT DEFAULT 'ALL_VERIFIED';
