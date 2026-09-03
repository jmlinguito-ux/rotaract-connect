-- Migration 0043: Cohosting MVP.
--
-- Organizers may open an event to cohosting clubs. Flow:
--   organizer enables cohosting → club requests → organizer approves/rejects →
--   club uploads a payment receipt → organizer verifies → cohost is PAID.
--
-- Approving a cohost auto-provisions an `event_club_allocations` row so
-- migration 0041 (Club Participant Allocation) governs the seats. Cancelling
-- an approved cohost releases that allocation.
--
-- Payments are the manual-verification variety the spec calls out (GCash /
-- Maya / bank / other), because for MVP that is much simpler than a real
-- gateway and matches how Rotaract clubs in the Philippines already pay.

-- ---------------------------------------------------------------------------
-- 1. Event-level configuration
-- ---------------------------------------------------------------------------

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cohosting_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Fee expressed in centavos to avoid float rounding. 0 = free cohosting.
  ADD COLUMN IF NOT EXISTS cohosting_fee_centavos INTEGER NOT NULL DEFAULT 0
    CHECK (cohosting_fee_centavos >= 0),
  ADD COLUMN IF NOT EXISTS cohosting_max_clubs INTEGER
    CHECK (cohosting_max_clubs IS NULL OR cohosting_max_clubs > 0),
  ADD COLUMN IF NOT EXISTS cohosting_application_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cohosting_requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  -- Free-text list of what the cohost gets (logo placement, slots, kit, etc.).
  -- Kept as text so organizers can phrase it in their own words per event.
  ADD COLUMN IF NOT EXISTS cohosting_benefits TEXT;

-- ---------------------------------------------------------------------------
-- 2. Cohost applications
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cohost_status') THEN
    CREATE TYPE public.cohost_status AS ENUM (
      'REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cohost_payment_status') THEN
    CREATE TYPE public.cohost_payment_status AS ENUM (
      'NONE', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.event_cohosts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  club_id                  UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  -- The person who filed the request, so the organizer can talk to them.
  requested_by_user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                   public.cohost_status NOT NULL DEFAULT 'REQUESTED',
  -- Head-count the club expects to bring, so the organizer can plan slots
  -- before allocation is granted.
  expected_participants    INTEGER NOT NULL DEFAULT 0 CHECK (expected_participants >= 0),
  -- Snapshot of the fee AT THE TIME OF REQUEST. If the organizer later
  -- changes the event's fee, in-flight requests keep the price they agreed to.
  agreed_fee_centavos      INTEGER NOT NULL DEFAULT 0 CHECK (agreed_fee_centavos >= 0),
  message                  TEXT,
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at              TIMESTAMPTZ,
  reviewed_by_user_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_notes             TEXT,
  -- Payment fields kept on the same row rather than a second table: MVP has
  -- exactly one payment per cohost (no installments), so a second table would
  -- add joins without earning them. Installments would justify splitting later.
  payment_status           public.cohost_payment_status NOT NULL DEFAULT 'NONE',
  payment_method           TEXT,
  payment_reference        TEXT,
  -- Object path in the private `cohost-receipts` bucket. Signed URLs are
  -- generated on demand; the path is what persists on the row.
  payment_receipt_path     TEXT,
  payment_submitted_at     TIMESTAMPTZ,
  payment_verified_at      TIMESTAMPTZ,
  payment_verified_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_review_notes     TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One live cohost row per (event, club). Re-requesting after rejection is
  -- handled by clearing the old row rather than accumulating history — MVP
  -- keeps this simple.
  UNIQUE (event_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_event_cohosts_event ON public.event_cohosts (event_id);
CREATE INDEX IF NOT EXISTS idx_event_cohosts_club  ON public.event_cohosts (club_id);

ALTER TABLE public.event_cohosts ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read cohost rows — the event detail screen shows the
-- roster to every viewer, and every viewer's own club needs to see its status.
DROP POLICY IF EXISTS "Cohosts readable by authenticated" ON public.event_cohosts;
CREATE POLICY "Cohosts readable by authenticated" ON public.event_cohosts
  FOR SELECT TO authenticated USING (true);

-- Writes go through the RPCs below, which enforce role-specific rules the
-- policy alone cannot express (only the organizer may approve, only the
-- requesting club may submit its own payment, etc.). The catch-all policy
-- keeps direct writes blocked.
DROP POLICY IF EXISTS "Cohosts writable via RPC only" ON public.event_cohosts;
CREATE POLICY "Cohosts writable via RPC only" ON public.event_cohosts
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.touch_event_cohost()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_event_cohost ON public.event_cohosts;
CREATE TRIGGER trg_touch_event_cohost
  BEFORE UPDATE ON public.event_cohosts
  FOR EACH ROW EXECUTE FUNCTION public.touch_event_cohost();

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------

-- The organizing team + admins may act on a cohost row. Mirrored in the
-- client's `canManageCohosting` for the same reason as the allocation rule.
CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id UUID, p_user UUID)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_role  public.user_role;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND OR p_user IS NULL THEN RETURN false; END IF;
  IF p_user = v_event.organizer_user_id THEN RETURN true; END IF;
  IF p_user = ANY(COALESCE(v_event.co_organizer_user_ids, '{}')) THEN RETURN true; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user;
  RETURN v_role IN ('DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_event(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Request → review → payment RPCs
-- ---------------------------------------------------------------------------

/**
 * request_cohost: a member of a club asks to cohost.
 * Only a Club President or Officer may file the request on their club's behalf.
 */
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
    payment_status        = 'NONE',
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

GRANT EXECUTE ON FUNCTION public.request_cohost(UUID, INTEGER, TEXT) TO authenticated;

/**
 * Internal helper: raise (never lower) the cohost's allocation to at least
 * `p_slots`, without overwriting an organizer's manual bump.
 */
CREATE OR REPLACE FUNCTION public.upsert_cohost_allocation(
  p_event_id UUID, p_club_id UUID, p_slots INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.event_club_allocations (event_id, club_id, allocated_slots, initial_slots)
  VALUES (p_event_id, p_club_id, p_slots, p_slots)
  ON CONFLICT (event_id, club_id) DO UPDATE
    SET allocated_slots = GREATEST(public.event_club_allocations.allocated_slots, EXCLUDED.allocated_slots);
END;
$$;

/**
 * review_cohost: organizer approves or rejects a pending request.
 * Approval provisions the allocation row so the club can start registering.
 */
CREATE OR REPLACE FUNCTION public.review_cohost(
  p_cohost_id UUID,
  p_action    TEXT,          -- 'APPROVE' | 'REJECT'
  p_notes     TEXT DEFAULT NULL
)
RETURNS public.event_cohosts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_row    public.event_cohosts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.event_cohosts WHERE id = p_cohost_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cohost request not found'; END IF;
  IF NOT public.can_manage_event(v_row.event_id, v_caller) THEN
    RAISE EXCEPTION 'Only the organizer may review cohost requests';
  END IF;
  IF v_row.status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;

  IF p_action NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  UPDATE public.event_cohosts
     SET status = CASE p_action WHEN 'APPROVE' THEN 'APPROVED'::public.cohost_status
                                 ELSE 'REJECTED'::public.cohost_status END,
         reviewed_at = NOW(),
         reviewed_by_user_id = v_caller,
         review_notes = p_notes
   WHERE id = p_cohost_id
  RETURNING * INTO v_row;

  IF p_action = 'APPROVE' AND v_row.expected_participants > 0 THEN
    PERFORM public.upsert_cohost_allocation(v_row.event_id, v_row.club_id, v_row.expected_participants);
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_cohost(UUID, TEXT, TEXT) TO authenticated;

/**
 * submit_cohost_payment: the cohosting club uploads a receipt for verification.
 * The receipt itself is a file uploaded separately to the private
 * `cohost-receipts` bucket; this RPC records the path plus method/reference.
 */
CREATE OR REPLACE FUNCTION public.submit_cohost_payment(
  p_cohost_id UUID,
  p_method    TEXT,
  p_reference TEXT DEFAULT NULL,
  p_receipt_path TEXT DEFAULT NULL
)
RETURNS public.event_cohosts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_row    public.event_cohosts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.event_cohosts WHERE id = p_cohost_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cohost row not found'; END IF;
  IF v_row.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Payment can only be submitted after approval';
  END IF;

  -- Only the requesting club (leadership) may submit a payment for it. The
  -- organizer is deliberately excluded from this — otherwise the same person
  -- who verifies could also record the payment.
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_caller;
  IF v_profile.club_id IS DISTINCT FROM v_row.club_id
     OR COALESCE(v_profile.club_role::text, '') NOT IN ('CLUB_PRESIDENT', 'OFFICER') THEN
    RAISE EXCEPTION 'Only the cohosting club leadership may submit its payment';
  END IF;

  IF p_method IS NULL OR btrim(p_method) = '' THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;

  UPDATE public.event_cohosts
     SET payment_method       = p_method,
         payment_reference    = p_reference,
         payment_receipt_path = p_receipt_path,
         payment_status       = 'PENDING_VERIFICATION',
         payment_submitted_at = NOW(),
         payment_verified_at  = NULL,
         payment_verified_by_user_id = NULL,
         payment_review_notes = NULL
   WHERE id = p_cohost_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_cohost_payment(UUID, TEXT, TEXT, TEXT) TO authenticated;

/**
 * verify_cohost_payment: organizer confirms or rejects the uploaded proof.
 */
CREATE OR REPLACE FUNCTION public.verify_cohost_payment(
  p_cohost_id UUID,
  p_action    TEXT,   -- 'VERIFY' | 'REJECT'
  p_notes     TEXT DEFAULT NULL
)
RETURNS public.event_cohosts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_row    public.event_cohosts%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.event_cohosts WHERE id = p_cohost_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cohost row not found'; END IF;
  IF NOT public.can_manage_event(v_row.event_id, v_caller) THEN
    RAISE EXCEPTION 'Only the organizer may verify payments';
  END IF;
  IF v_row.payment_status <> 'PENDING_VERIFICATION' THEN
    RAISE EXCEPTION 'No pending payment to verify';
  END IF;

  IF p_action NOT IN ('VERIFY', 'REJECT') THEN
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  UPDATE public.event_cohosts
     SET payment_status = CASE p_action WHEN 'VERIFY' THEN 'VERIFIED'::public.cohost_payment_status
                                          ELSE 'REJECTED'::public.cohost_payment_status END,
         payment_verified_at = NOW(),
         payment_verified_by_user_id = v_caller,
         payment_review_notes = p_notes
   WHERE id = p_cohost_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_cohost_payment(UUID, TEXT, TEXT) TO authenticated;

/**
 * cancel_cohost: either the organizer or the cohosting club leadership may
 * cancel. Cancelling an APPROVED cohost also removes its allocation row so
 * the seats return to the general pool.
 */
CREATE OR REPLACE FUNCTION public.cancel_cohost(
  p_cohost_id UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS public.event_cohosts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_row    public.event_cohosts%ROWTYPE;
  v_authorised BOOLEAN := false;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.event_cohosts WHERE id = p_cohost_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cohost row not found'; END IF;
  IF v_row.status IN ('REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'This cohost is already closed';
  END IF;

  IF public.can_manage_event(v_row.event_id, v_caller) THEN
    v_authorised := true;
  ELSE
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_caller;
    IF v_profile.club_id = v_row.club_id
       AND COALESCE(v_profile.club_role::text, '') IN ('CLUB_PRESIDENT', 'OFFICER') THEN
      v_authorised := true;
    END IF;
  END IF;

  IF NOT v_authorised THEN
    RAISE EXCEPTION 'Not permitted to cancel this cohost';
  END IF;

  UPDATE public.event_cohosts
     SET status = 'CANCELLED',
         review_notes = COALESCE(p_reason, review_notes)
   WHERE id = p_cohost_id
  RETURNING * INTO v_row;

  -- Free the reserved slots. Any members already registered keep their seats.
  DELETE FROM public.event_club_allocations
   WHERE event_id = v_row.event_id AND club_id = v_row.club_id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_cohost(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Storage bucket for uploaded receipts
-- ---------------------------------------------------------------------------
-- Marked private so only signed URLs work — receipts often show account details.

INSERT INTO storage.buckets (id, name, public)
VALUES ('cohost-receipts', 'cohost-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- The RPCs do the writing under SECURITY DEFINER, but the file upload itself
-- goes direct to storage. Scope it: authenticated users may only touch objects
-- filed under their own club's folder.
DROP POLICY IF EXISTS "Cohost receipts: club may upload own" ON storage.objects;
CREATE POLICY "Cohost receipts: club may upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cohost-receipts'
    AND (storage.foldername(name))[1] = (
      SELECT club_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Cohost receipts: club may read own" ON storage.objects;
CREATE POLICY "Cohost receipts: club may read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cohost-receipts'
    AND (
      -- The submitting club itself.
      (storage.foldername(name))[1] = (
        SELECT club_id::text FROM public.profiles WHERE id = auth.uid()
      )
      -- Or the organizer of the event this receipt belongs to.
      OR EXISTS (
        SELECT 1 FROM public.event_cohosts ec
        WHERE ec.payment_receipt_path = storage.objects.name
          AND public.can_manage_event(ec.event_id, auth.uid())
      )
    )
  );
