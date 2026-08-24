-- Migration 0044: Fix request_cohost RPC enum casts and sync club_role for club presidents

UPDATE public.profiles
SET club_role = 'CLUB_PRESIDENT'
WHERE role = 'CLUB_PRESIDENT' AND club_role IS DISTINCT FROM 'CLUB_PRESIDENT';

CREATE OR REPLACE FUNCTION public.request_cohost(
  p_event_id             UUID,
  p_expected_participants INTEGER DEFAULT 0,
  p_message              TEXT DEFAULT NULL
)
RETURNS public.event_cohosts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_profile      public.profiles%ROWTYPE;
  v_event        public.events%ROWTYPE;
  v_current_cnt  INTEGER;
  v_row          public.event_cohosts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_caller;
  IF v_profile.club_id IS NULL THEN
    RAISE EXCEPTION 'You must belong to a club to request cohosting';
  END IF;
  -- Only club leadership may commit their club to a cohost fee.
  IF COALESCE(v_profile.club_role::text, '') NOT IN ('CLUB_PRESIDENT', 'OFFICER') THEN
    RAISE EXCEPTION 'Only your Club President or an Officer may request cohosting';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF NOT v_event.cohosting_enabled THEN
    RAISE EXCEPTION 'This event does not accept cohosting requests';
  END IF;
  IF v_event.organizing_club_id = v_profile.club_id THEN
    RAISE EXCEPTION 'The organizing club is not a cohost';
  END IF;
  IF v_event.cohosting_application_deadline IS NOT NULL
     AND NOW() > v_event.cohosting_application_deadline THEN
    RAISE EXCEPTION 'The cohosting application deadline has passed';
  END IF;
  IF v_event.cohosting_max_clubs IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_cnt
    FROM public.event_cohosts
    WHERE event_id = p_event_id AND status IN ('REQUESTED', 'APPROVED');
    IF v_current_cnt >= v_event.cohosting_max_clubs THEN
      RAISE EXCEPTION 'The cohost cap of % has been reached', v_event.cohosting_max_clubs;
    END IF;
  END IF;

  -- Upsert: a rejected/cancelled row can be resubmitted. An in-flight
  -- REQUESTED/APPROVED row is not replaced.
  SELECT * INTO v_row FROM public.event_cohosts
   WHERE event_id = p_event_id AND club_id = v_profile.club_id;
  IF FOUND AND v_row.status IN ('REQUESTED', 'APPROVED') THEN
    RAISE EXCEPTION 'Your club already has a cohost request for this event';
  END IF;

  INSERT INTO public.event_cohosts (
    event_id, club_id, requested_by_user_id,
    status, expected_participants,
    agreed_fee_centavos, message,
    requested_at,
    -- Auto-approval path when the organizer chose to skip approval.
    reviewed_at, reviewed_by_user_id,
    payment_status
  )
  VALUES (
    p_event_id, v_profile.club_id, v_caller,
    CASE WHEN v_event.cohosting_requires_approval THEN 'REQUESTED'::public.cohost_status ELSE 'APPROVED'::public.cohost_status END,
    COALESCE(p_expected_participants, 0),
    v_event.cohosting_fee_centavos,
    p_message,
    NOW(),
    CASE WHEN v_event.cohosting_requires_approval THEN NULL ELSE NOW() END,
    CASE WHEN v_event.cohosting_requires_approval THEN NULL ELSE v_caller END,
    'NONE'::public.cohost_payment_status
  )
  ON CONFLICT (event_id, club_id) DO UPDATE SET
    requested_by_user_id  = EXCLUDED.requested_by_user_id,
    status                = EXCLUDED.status,
    expected_participants = EXCLUDED.expected_participants,
    agreed_fee_centavos   = EXCLUDED.agreed_fee_centavos,
    message               = EXCLUDED.message,
    requested_at          = NOW(),
    reviewed_at           = EXCLUDED.reviewed_at,
    reviewed_by_user_id   = EXCLUDED.reviewed_by_user_id,
    review_notes          = NULL,
    payment_status        = 'NONE'::public.cohost_payment_status,
    payment_method        = NULL,
    payment_reference     = NULL,
    payment_receipt_path  = NULL,
    payment_submitted_at  = NULL,
    payment_verified_at   = NULL,
    payment_verified_by_user_id = NULL,
    payment_review_notes  = NULL
  RETURNING * INTO v_row;

  -- Auto-approved cohosts get their allocation row up front too, so the
  -- Phase 1 rules apply immediately.
  IF v_row.status = 'APPROVED' AND v_row.expected_participants > 0 THEN
    PERFORM public.upsert_cohost_allocation(v_row.event_id, v_row.club_id, v_row.expected_participants);
  END IF;

  RETURN v_row;
END;
$$;
