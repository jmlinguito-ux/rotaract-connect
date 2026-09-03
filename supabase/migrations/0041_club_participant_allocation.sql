-- Migration 0041: Club participant allocation.
--
-- Organizers can reserve an initial number of participant slots per club so no
-- single club can consume the whole event on a first-come basis, without
-- permanently wasting capacity the clubs never use.
--
-- Three modes:
--   NONE  - no reservation; plain first-come, first-served (existing behaviour).
--   SOFT  - each club holds `allocated_slots`; whatever is still unused at
--           `allocation_release_at` returns to the general pool for anyone.
--   HARD  - each club may never exceed `allocated_slots`, ever.
--
-- "Released" is derived from `allocation_release_at` rather than written by a
-- job, so the rule is correct the moment the deadline passes even if no cron
-- run has happened yet. `allocation_released_at` only records an EARLY manual
-- release by the organizer.

-- ---------------------------------------------------------------------------
-- 1. Event-level configuration
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allocation_mode') THEN
    CREATE TYPE public.allocation_mode AS ENUM ('NONE', 'SOFT', 'HARD');
  END IF;
END$$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS allocation_mode public.allocation_mode NOT NULL DEFAULT 'NONE',
  -- Slots a club gets when the organizer has not set an explicit per-club
  -- override. NULL while allocation_mode = 'NONE'.
  ADD COLUMN IF NOT EXISTS default_club_allocation INTEGER
    CHECK (default_club_allocation IS NULL OR default_club_allocation >= 0),
  -- When unused SOFT slots return to the general pool. NULL = never release.
  ADD COLUMN IF NOT EXISTS allocation_release_at TIMESTAMPTZ,
  -- Set only when an organizer releases ahead of the deadline.
  ADD COLUMN IF NOT EXISTS allocation_released_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Per-club allocation rows
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_club_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  club_id      UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  -- Current ceiling for this club. Organizers may raise it manually at any time.
  allocated_slots INTEGER NOT NULL DEFAULT 0 CHECK (allocated_slots >= 0),
  -- Audit only: what the organizer first granted, so a later manual bump is
  -- visible as a change rather than silently overwriting history.
  initial_slots   INTEGER NOT NULL DEFAULT 0 CHECK (initial_slots >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_event_club_allocations_event
  ON public.event_club_allocations (event_id);

ALTER TABLE public.event_club_allocations ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user: clubs must be able to see their own
-- ceiling, and the event detail screen shows the split to every viewer.
DROP POLICY IF EXISTS "Allocations readable by authenticated" ON public.event_club_allocations;
CREATE POLICY "Allocations readable by authenticated" ON public.event_club_allocations
  FOR SELECT TO authenticated USING (true);

-- Only the people who run the event may change the split.
DROP POLICY IF EXISTS "Allocations writable by organizers" ON public.event_club_allocations;
CREATE POLICY "Allocations writable by organizers" ON public.event_club_allocations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_club_allocations.event_id
        AND (
          auth.uid() = e.organizer_user_id
          OR auth.uid() = ANY(e.co_organizer_user_ids)
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_club_allocations.event_id
        AND (
          auth.uid() = e.organizer_user_id
          OR auth.uid() = ANY(e.co_organizer_user_ids)
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role)
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.touch_event_club_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_event_club_allocation ON public.event_club_allocations;
CREATE TRIGGER trg_touch_event_club_allocation
  BEFORE UPDATE ON public.event_club_allocations
  FOR EACH ROW EXECUTE FUNCTION public.touch_event_club_allocation();

-- ---------------------------------------------------------------------------
-- 3. Server-side enforcement
-- ---------------------------------------------------------------------------

-- Mirrors utils/clubAllocation.ts. The client blocks the button; this is what
-- actually stops a crafted request, so the two must agree.
CREATE OR REPLACE FUNCTION public.club_allocation_remaining(
  p_event_id UUID,
  p_club_id  UUID
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event         public.events%ROWTYPE;
  v_mode          public.allocation_mode;
  v_released      boolean;
  v_capacity      integer;
  v_taken         integer;   -- everyone holding a seat, any club
  v_club_alloc    integer;
  v_club_taken    integer;
  v_club_left     integer;
  v_reserved      integer;   -- unused slots still held back for other clubs
  v_general_left  integer;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Event not found');
  END IF;

  v_mode     := v_event.allocation_mode;
  v_capacity := COALESCE(v_event.max_participants, 0);

  -- PENDING holds a seat too: an approval queue that could overshoot capacity
  -- would let the organizer approve more people than the venue takes.
  SELECT COUNT(*) INTO v_taken
  FROM public.event_participants
  WHERE event_id = p_event_id AND status IN ('JOINED', 'PENDING');

  IF v_capacity > 0 AND v_taken >= v_capacity THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Event is at full capacity');
  END IF;

  IF v_mode = 'NONE' THEN
    RETURN jsonb_build_object('allowed', true, 'reason', NULL);
  END IF;

  v_released := (v_event.allocation_released_at IS NOT NULL)
             OR (v_event.allocation_release_at IS NOT NULL AND NOW() >= v_event.allocation_release_at);

  -- A club with no explicit row falls back to the event-wide default.
  SELECT allocated_slots INTO v_club_alloc
  FROM public.event_club_allocations
  WHERE event_id = p_event_id AND club_id = p_club_id;
  IF NOT FOUND THEN
    v_club_alloc := COALESCE(v_event.default_club_allocation, 0);
  END IF;

  SELECT COUNT(*) INTO v_club_taken
  FROM public.event_participants ep
  JOIN public.profiles pr ON pr.id = ep.user_id
  WHERE ep.event_id = p_event_id
    AND ep.status IN ('JOINED', 'PENDING')
    AND pr.club_id = p_club_id;

  v_club_left := GREATEST(v_club_alloc - v_club_taken, 0);

  IF v_mode = 'HARD' THEN
    IF v_club_left > 0 THEN
      RETURN jsonb_build_object('allowed', true, 'reason', NULL);
    END IF;
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Your club has used all ' || v_club_alloc || ' of its allocated slots'
    );
  END IF;

  -- SOFT: own reserved slot first.
  IF v_club_left > 0 THEN
    RETURN jsonb_build_object('allowed', true, 'reason', NULL);
  END IF;

  -- Otherwise only genuinely unreserved capacity is available. Before the
  -- release deadline, other clubs' unused slots are NOT part of that.
  IF v_released THEN
    v_reserved := 0;
  ELSE
    SELECT COALESCE(SUM(GREATEST(alloc.slots - COALESCE(used.n, 0), 0)), 0)
      INTO v_reserved
    FROM (
      SELECT club_id, allocated_slots AS slots
      FROM public.event_club_allocations
      WHERE event_id = p_event_id AND club_id <> p_club_id
    ) alloc
    LEFT JOIN (
      SELECT pr.club_id, COUNT(*) AS n
      FROM public.event_participants ep
      JOIN public.profiles pr ON pr.id = ep.user_id
      WHERE ep.event_id = p_event_id AND ep.status IN ('JOINED', 'PENDING')
      GROUP BY pr.club_id
    ) used ON used.club_id = alloc.club_id;
  END IF;

  v_general_left := v_capacity - v_taken - v_reserved;

  IF v_general_left > 0 THEN
    RETURN jsonb_build_object('allowed', true, 'reason', NULL);
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'reason', CASE
      WHEN v_released THEN 'Event is at full capacity'
      ELSE 'Your club has used its allocated slots. Unused slots from other clubs are released later.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.club_allocation_remaining(UUID, UUID) TO authenticated;

-- Blocks an over-allocation insert regardless of which client made it.
CREATE OR REPLACE FUNCTION public.enforce_club_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id UUID;
  v_check   jsonb;
  v_event   public.events%ROWTYPE;
BEGIN
  -- Only gate someone taking a NEW seat. Status changes on an existing row
  -- (approve / cancel) must stay free, or an organizer could not approve a
  -- pending request once the pool filled.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('JOINED', 'PENDING') THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('JOINED', 'PENDING') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = NEW.event_id;
  IF NOT FOUND OR v_event.allocation_mode = 'NONE' THEN
    RETURN NEW;
  END IF;

  -- The organizing team is seated automatically when the event is created or a
  -- co-organizer is added. They run the event, so they are never subject to
  -- their club's allocation — blocking them would break event creation itself.
  IF NEW.user_id = v_event.organizer_user_id
     OR NEW.user_id = ANY(COALESCE(v_event.co_organizer_user_ids, '{}')) THEN
    RETURN NEW;
  END IF;

  SELECT club_id INTO v_club_id FROM public.profiles WHERE id = NEW.user_id;
  IF v_club_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_check := public.club_allocation_remaining(NEW.event_id, v_club_id);
  IF (v_check ->> 'allowed')::boolean THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'club_allocation_exceeded: %', COALESCE(v_check ->> 'reason', 'No slots available');
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_club_allocation ON public.event_participants;
CREATE TRIGGER trg_enforce_club_allocation
  BEFORE INSERT OR UPDATE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_club_allocation();

-- ---------------------------------------------------------------------------
-- 4. Organizer actions
-- ---------------------------------------------------------------------------

-- Raise (or lower) one club's ceiling. Upserts so a club that never had an
-- explicit row can still be granted extra slots.
CREATE OR REPLACE FUNCTION public.set_club_allocation(
  p_event_id UUID,
  p_club_id  UUID,
  p_slots    INTEGER
)
RETURNS public.event_club_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_row   public.event_club_allocations%ROWTYPE;
BEGIN
  IF p_slots < 0 THEN
    RAISE EXCEPTION 'Slots must be zero or more';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT (
    auth.uid() = v_event.organizer_user_id
    OR auth.uid() = ANY(v_event.co_organizer_user_ids)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role)
    )
  ) THEN
    RAISE EXCEPTION 'Only the organizer can change club allocations';
  END IF;

  INSERT INTO public.event_club_allocations (event_id, club_id, allocated_slots, initial_slots)
  VALUES (p_event_id, p_club_id, p_slots, p_slots)
  ON CONFLICT (event_id, club_id)
  DO UPDATE SET allocated_slots = EXCLUDED.allocated_slots
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_club_allocation(UUID, UUID, INTEGER) TO authenticated;

-- Release every club's unused slots immediately, ahead of the deadline.
CREATE OR REPLACE FUNCTION public.release_club_allocations(p_event_id UUID)
RETURNS public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT (
    auth.uid() = v_event.organizer_user_id
    OR auth.uid() = ANY(v_event.co_organizer_user_ids)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role)
    )
  ) THEN
    RAISE EXCEPTION 'Only the organizer can release allocations';
  END IF;

  UPDATE public.events
     SET allocation_released_at = NOW()
   WHERE id = p_event_id
     AND allocation_released_at IS NULL
  RETURNING * INTO v_event;

  IF v_event.id IS NULL THEN
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  END IF;

  RETURN v_event;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_club_allocations(UUID) TO authenticated;
