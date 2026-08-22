-- Migration 0037: teach admin_set_role about DISTRICT_AREA_ADMIN.
--
-- 0027's CASE maps only APP_ADMIN and DISTRICT_ADMIN to a system_role and sends
-- everything else to 'NONE'. Promoting someone through the Role Management screen
-- therefore produced role='DISTRICT_AREA_ADMIN' with system_role='NONE' — and
-- getSystemRole() in src/utils/roles.ts returns system_role when it is set, so the
-- new Area Admin would have had NO authority at all. Silent, and only visible as
-- "the role does nothing".
--
-- Only the system-role derivation changes; the rest of 0027's body is preserved.

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
      WHEN v_new_legacy_role = 'DISTRICT_AREA_ADMIN' THEN 'DISTRICT_AREA_ADMIN'  -- added
      ELSE 'NONE'
    END
  );

  IF v_new_sys_role = 'APP_ADMIN' AND v_actor_sys_role IS DISTINCT FROM 'APP_ADMIN' AND v_actor_role IS DISTINCT FROM 'APP_ADMIN' THEN
    RAISE EXCEPTION 'Only App Admins can grant or modify App Admin permissions';
  END IF;

  v_new_club_role := COALESCE(p_club_role,
    CASE WHEN v_new_legacy_role = 'CLUB_PRESIDENT' THEN 'CLUB_PRESIDENT' ELSE v_target.club_role END
  );

  v_new_position := COALESCE(p_position, v_target.position);

  UPDATE profiles
     SET role        = v_new_legacy_role,
         system_role = v_new_sys_role,
         club_role   = v_new_club_role,
         position    = v_new_position
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_role(uuid, text, text, text, text) TO authenticated;
