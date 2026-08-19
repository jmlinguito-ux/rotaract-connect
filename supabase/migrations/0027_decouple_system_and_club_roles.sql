-- Migration 0027: Decouple System/District Access from Club Leadership Roles
--
-- This migration adds explicit `system_role` and `club_role` columns to `profiles`
-- while preserving full backward compatibility with `role` and `position`.

-- 1. Create enum types if not exists, or add text columns with check constraints
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS system_role text DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS club_role text DEFAULT 'MEMBER';

-- Add check constraints for integrity
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_system_role_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_system_role_check 
      CHECK (system_role IN ('APP_ADMIN', 'DISTRICT_ADMIN', 'NONE'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_club_role_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_club_role_check 
      CHECK (club_role IN ('CLUB_PRESIDENT', 'OFFICER', 'MEMBER'));
  END IF;
END $$;

-- 2. Backfill existing profile rows based on current `role` and `position`
UPDATE profiles
SET 
  system_role = CASE 
    WHEN role = 'APP_ADMIN' OR position ILIKE '%App Admin%' THEN 'APP_ADMIN'
    WHEN role = 'DISTRICT_ADMIN' OR position ILIKE '%District Admin%' OR position ILIKE '%District Governor%' OR position ILIKE '%DRR%' THEN 'DISTRICT_ADMIN'
    ELSE 'NONE'
  END,
  club_role = CASE
    WHEN role = 'CLUB_PRESIDENT' OR position ILIKE '%President%' THEN 'CLUB_PRESIDENT'
    WHEN position ILIKE '%Vice President%' OR position ILIKE '%Secretary%' OR position ILIKE '%Treasurer%' OR position ILIKE '%Director%' OR position ILIKE '%Officer%' OR position ILIKE '%Auditor%' THEN 'OFFICER'
    ELSE 'MEMBER'
  END
WHERE system_role IS NULL OR system_role = 'NONE';

-- 3. Enhanced atomic RPC for setting decoupled roles
-- Supports both App Admins (can edit both system & club roles) 
-- and District Admins (can assign Club Presidents & Officers).
DROP FUNCTION IF EXISTS admin_set_role(uuid, text);
DROP FUNCTION IF EXISTS admin_set_role(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION admin_set_role(
  p_user_id uuid,
  p_role text,
  p_system_role text DEFAULT NULL,
  p_club_role text DEFAULT NULL,
  p_position text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_actor_sys_role text;
  v_target profiles;
  v_new_legacy_role user_role := p_role::user_role;
  v_new_sys_role text;
  v_new_club_role text;
  v_new_position text;
  v_becomes_president boolean;
  v_loses_presidency boolean;
BEGIN
  -- Identify caller privileges
  SELECT role, system_role INTO v_actor_role, v_actor_sys_role FROM profiles WHERE id = auth.uid();
  
  IF v_actor_role IS DISTINCT FROM 'APP_ADMIN' 
     AND v_actor_sys_role IS DISTINCT FROM 'APP_ADMIN' 
     AND v_actor_role IS DISTINCT FROM 'DISTRICT_ADMIN' 
     AND v_actor_sys_role IS DISTINCT FROM 'DISTRICT_ADMIN' THEN
    RAISE EXCEPTION 'Only App Admins and District Admins can manage roles';
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_user_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Determine new system role (District Admins cannot grant App Admin)
  v_new_sys_role := COALESCE(p_system_role, 
    CASE 
      WHEN v_new_legacy_role = 'APP_ADMIN' THEN 'APP_ADMIN'
      WHEN v_new_legacy_role = 'DISTRICT_ADMIN' THEN 'DISTRICT_ADMIN'
      ELSE 'NONE'
    END
  );

  IF v_new_sys_role = 'APP_ADMIN' AND v_actor_sys_role IS DISTINCT FROM 'APP_ADMIN' AND v_actor_role IS DISTINCT FROM 'APP_ADMIN' THEN
    RAISE EXCEPTION 'Only App Admins can grant or modify App Admin permissions';
  END IF;

  -- Determine new club role & position
  v_new_club_role := COALESCE(p_club_role,
    CASE 
      WHEN v_new_legacy_role = 'CLUB_PRESIDENT' THEN 'CLUB_PRESIDENT'
      ELSE 'MEMBER'
    END
  );

  v_becomes_president := v_new_club_role = 'CLUB_PRESIDENT' OR p_position ILIKE '%President%';
  v_loses_presidency := (v_target.club_role = 'CLUB_PRESIDENT' OR v_target.role = 'CLUB_PRESIDENT') AND NOT v_becomes_president;

  v_new_position := COALESCE(p_position, 
    CASE 
      WHEN v_becomes_president THEN 'President'
      WHEN v_loses_presidency THEN 'Member'
      ELSE v_target.position
    END
  );

  -- Perform atomic update
  UPDATE profiles
  SET 
    role = v_new_legacy_role,
    system_role = v_new_sys_role,
    club_role = v_new_club_role,
    position = v_new_position
  WHERE id = p_user_id;

  -- Synchronize club presidency if applicable
  IF v_target.club_id IS NOT NULL AND (v_becomes_president OR v_loses_presidency) THEN
    UPDATE clubs
    SET president_id = CASE WHEN v_becomes_president THEN p_user_id ELSE NULL END
    WHERE id = v_target.club_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_role(uuid, text, text, text, text) TO authenticated;
