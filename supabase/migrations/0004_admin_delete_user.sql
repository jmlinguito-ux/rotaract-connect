-- App Admin can permanently remove a user.
--
-- Deleting from auth.users cascades to the profile and all the user's data
-- (ON DELETE CASCADE across the schema). SECURITY DEFINER so it can touch the
-- auth schema; authorization is checked from the caller's profile role. Clients
-- can't delete auth users directly (that needs the service role), so this RPC is
-- the in-app path, restricted to App Admins.
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'APP_ADMIN' THEN
    RAISE EXCEPTION 'Only App Admins can remove users';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove your own account';
  END IF;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_user(uuid) TO authenticated;
