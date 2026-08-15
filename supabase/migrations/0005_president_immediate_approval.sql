-- Club President immediate approval: a President validating one of their own
-- club's member applications now VERIFIES them outright (no separate App Admin
-- step). Only the CLUB_VALIDATE mapping changes vs. 0002 — authorization is
-- unchanged (Presidents still act only on their club's non-president apps).
CREATE OR REPLACE FUNCTION review_application(p_app_id uuid, p_action text, p_notes text DEFAULT '')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app verification_applications;
  v_actor profiles;
  v_new_status verification_status;
  v_is_president boolean;
BEGIN
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_app FROM verification_applications WHERE id = p_app_id;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;

  v_is_president := position('president' IN lower(v_app.position)) > 0;

  IF v_actor.role = 'APP_ADMIN' THEN
    NULL;
  ELSIF v_actor.role = 'DISTRICT_ADMIN' THEN
    IF NOT v_is_president THEN
      RAISE EXCEPTION 'District Admin reviews president applications only';
    END IF;
  ELSIF v_actor.role = 'CLUB_PRESIDENT' THEN
    IF v_is_president OR v_actor.club_id IS DISTINCT FROM v_app.club_id THEN
      RAISE EXCEPTION 'Club President can only review their own club''s member applications';
    END IF;
    IF p_action NOT IN ('CLUB_VALIDATE', 'REQUEST_INFO', 'REJECT') THEN
      RAISE EXCEPTION 'Club President cannot perform action %', p_action;
    END IF;
  ELSE
    RAISE EXCEPTION 'Not authorized to review applications';
  END IF;

  v_new_status := (CASE p_action
    WHEN 'CLUB_VALIDATE'    THEN 'VERIFIED'   -- President approval is final for their members
    WHEN 'DISTRICT_APPROVE' THEN 'VERIFIED'
    WHEN 'ADMIN_APPROVE'    THEN 'VERIFIED'
    WHEN 'REQUEST_INFO'     THEN 'NEEDS_INFORMATION'
    WHEN 'REJECT'           THEN 'REJECTED'
    ELSE NULL
  END)::verification_status;
  IF v_new_status IS NULL THEN RAISE EXCEPTION 'Unknown action %', p_action; END IF;

  UPDATE verification_applications
    SET status = v_new_status,
        notes = COALESCE(NULLIF(p_notes, ''), notes)
    WHERE id = p_app_id;

  UPDATE profiles SET verification_status = v_new_status WHERE id = v_app.user_id;

  INSERT INTO audit_logs (application_id, action, performed_by_name, performed_by_role, previous_status, new_status, notes)
  VALUES (p_app_id, p_action, v_actor.full_name, v_actor.role, v_app.status, v_new_status, COALESCE(p_notes, ''));

  RETURN v_new_status::text;
END;
$$;

GRANT EXECUTE ON FUNCTION review_application(uuid, text, text) TO authenticated;
