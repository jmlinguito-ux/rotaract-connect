-- Migration 0038: restore the club-presidency sync dropped by 0037.
--
-- 0037 rewrote admin_set_role to add the DISTRICT_AREA_ADMIN system-role mapping,
-- but reproduced only part of 0027's body. It lost:
--   * v_becomes_president / v_loses_presidency derivation,
--   * position auto-set to 'President' / 'Member',
--   * club_role falling back to 'MEMBER' rather than the previous value,
--   * the UPDATE clubs SET president_id sync.
--
-- Net effect on 0037: promoting a member to CLUB_PRESIDENT no longer recorded them
-- as the club's president, and demoting one never cleared it — so approvals, which
-- resolve the approver via clubs.president_id, would have gone to the wrong person.
--
-- This is 0027's body verbatim with only the system-role CASE extended.

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

  v_new_sys_role := COALESCE(p_system_role,
    CASE
      WHEN v_new_legacy_role = 'APP_ADMIN'           THEN 'APP_ADMIN'
      WHEN v_new_legacy_role = 'DISTRICT_ADMIN'      THEN 'DISTRICT_ADMIN'
      WHEN v_new_legacy_role = 'DISTRICT_AREA_ADMIN' THEN 'DISTRICT_AREA_ADMIN'
      ELSE 'NONE'
    END
  );

  IF v_new_sys_role = 'APP_ADMIN' AND v_actor_sys_role IS DISTINCT FROM 'APP_ADMIN' AND v_actor_role IS DISTINCT FROM 'APP_ADMIN' THEN
    RAISE EXCEPTION 'Only App Admins can grant or modify App Admin permissions';
  END IF;

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

  UPDATE profiles
  SET role        = v_new_legacy_role,
      system_role = v_new_sys_role,
      club_role   = v_new_club_role,
      position    = v_new_position
  WHERE id = p_user_id;

  IF v_target.club_id IS NOT NULL AND (v_becomes_president OR v_loses_presidency) THEN
    UPDATE clubs
    SET president_id = CASE WHEN v_becomes_president THEN p_user_id ELSE NULL END
    WHERE id = v_target.club_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_role(uuid, text, text, text, text) TO authenticated;
