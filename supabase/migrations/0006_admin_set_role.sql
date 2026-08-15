-- App Admin can change another user's role.
--
-- profiles RLS only lets a user update their OWN row ("Users can update their
-- own profile"), so an App Admin changing someone else's role via a direct
-- update silently affected zero rows and never persisted. The clubs table has
-- no UPDATE policy at all, so syncing the club president failed the same way.
--
-- This SECURITY DEFINER RPC performs the whole transition atomically and
-- enforces authorization by the caller's role: only App Admins may assign roles
-- (matching the in-app Role Management screen). It also keeps role, position,
-- and the club's recorded president in step:
--   * becoming CLUB_PRESIDENT  -> position 'President', club president_id = user
--   * leaving  CLUB_PRESIDENT  -> position 'Member',   club president_id = NULL
CREATE OR REPLACE FUNCTION admin_set_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role user_role;
  v_target     profiles;
  v_new_role   user_role := p_role::user_role;
  v_becomes_president boolean;
  v_loses_presidency  boolean;
  v_new_position text;
BEGIN
  SELECT role INTO v_actor_role FROM profiles WHERE id = auth.uid();
  IF v_actor_role IS DISTINCT FROM 'APP_ADMIN' THEN
    RAISE EXCEPTION 'Only App Admins can change roles';
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_user_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_becomes_president := v_new_role = 'CLUB_PRESIDENT';
  v_loses_presidency  := v_target.role = 'CLUB_PRESIDENT' AND v_new_role <> 'CLUB_PRESIDENT';
  v_new_position := CASE
    WHEN v_becomes_president THEN 'President'
    WHEN v_loses_presidency  THEN 'Member'
    ELSE v_target.position
  END;

  UPDATE profiles
    SET role = v_new_role, position = v_new_position
    WHERE id = p_user_id;

  IF v_target.club_id IS NOT NULL AND (v_becomes_president OR v_loses_presidency) THEN
    UPDATE clubs
      SET president_id = CASE WHEN v_becomes_president THEN p_user_id ELSE NULL END
      WHERE id = v_target.club_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_set_role(uuid, text) TO authenticated;
