-- =============================================================================
-- ROTARACT CONNECT — COMPLETE SUPABASE DATABASE SETUP & SEED
-- Generated & synced from live production database
-- =============================================================================
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = "UTF8";
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS "public";
CREATE SCHEMA IF NOT EXISTS "extensions";
CREATE SCHEMA IF NOT EXISTS "storage";
CREATE SCHEMA IF NOT EXISTS "auth";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

DO $$ BEGIN
  CREATE PUBLICATION "supabase_realtime";
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage Buckets Setup
INSERT INTO storage.buckets (id, name, public) VALUES
  ("avatars", "avatars", true),
  ("event-covers", "event-covers", true),
  ("verification-proofs", "verification-proofs", false),
  ("chat-media", "chat-media", false)
ON CONFLICT (id) DO NOTHING;


--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: allocation_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.allocation_mode AS ENUM (
    'NONE',
    'SOFT',
    'HARD'
);


--
-- Name: area_of_focus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.area_of_focus AS ENUM (
    'PEACEBUILDING',
    'DISEASE_PREVENTION',
    'WATER_SANITATION',
    'MATERNAL_CHILD_HEALTH',
    'EDUCATION_LITERACY',
    'COMMUNITY_DEVELOPMENT',
    'ENVIRONMENT'
);


--
-- Name: attendance_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.attendance_status AS ENUM (
    'NOT_MARKED',
    'ATTENDED',
    'ABSENT'
);


--
-- Name: check_in_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.check_in_method AS ENUM (
    'SELF_GPS',
    'ORGANIZER',
    'ORGANIZER_QR'
);


--
-- Name: cohost_payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cohost_payment_status AS ENUM (
    'NONE',
    'PENDING_VERIFICATION',
    'VERIFIED',
    'REJECTED'
);


--
-- Name: cohost_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cohost_status AS ENUM (
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_status AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'PUBLISHED',
    'RECRUITING',
    'SCHEDULED',
    'ONGOING',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_type AS ENUM (
    'SERVICE_PROJECT',
    'FELLOWSHIP',
    'DISTRICT_EVENT'
);


--
-- Name: event_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_visibility AS ENUM (
    'VERIFIED_ROTARACTORS',
    'CLUB_ONLY',
    'INVITATION_ONLY'
);


--
-- Name: invitation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invitation_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED'
);


--
-- Name: notification_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_kind AS ENUM (
    'VERIFICATION_UPDATE',
    'ROLE_ASSIGNED',
    'INVITATION_RECEIVED',
    'INVITATION_RESPONSE',
    'JOIN_REQUEST',
    'JOIN_APPROVED',
    'EVENT_REMINDER',
    'EVENT_UPDATE',
    'EVENT_APPROVAL_REQUEST',
    'EVENT_APPROVED',
    'MEMBERSHIP_REQUEST',
    'INQUIRY_RECEIVED',
    'EMERGENCY_BROADCAST',
    'CERTIFICATE_READY'
);


--
-- Name: participation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.participation_status AS ENUM (
    'PENDING',
    'JOINED',
    'CANCELLED'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'MEMBER',
    'CLUB_PRESIDENT',
    'DISTRICT_ADMIN',
    'APP_ADMIN',
    'DISTRICT_AREA_ADMIN'
);


--
-- Name: verification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.verification_status AS ENUM (
    'PENDING',
    'AWAITING_CLUB_VALIDATION',
    'CLUB_VALIDATED',
    'AWAITING_DISTRICT_VALIDATION',
    'AWAITING_ADMIN_VERIFICATION',
    'NEEDS_INFORMATION',
    'REJECTED',
    'VERIFIED',
    'SUSPENDED'
);


--
-- Name: admin_delete_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_user(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_set_role(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_role(p_user_id uuid, p_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_set_role(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_role(p_user_id uuid, p_role text, p_system_role text DEFAULT NULL::text, p_club_role text DEFAULT NULL::text, p_position text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    event_type public.event_type NOT NULL,
    status public.event_status DEFAULT 'DRAFT'::public.event_status NOT NULL,
    start_datetime timestamp with time zone NOT NULL,
    end_datetime timestamp with time zone NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    organizing_club_id uuid NOT NULL,
    organizer_user_id uuid NOT NULL,
    co_organizer_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    approved_by_club_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    max_participants integer DEFAULT 50 NOT NULL,
    requires_approval boolean DEFAULT false NOT NULL,
    allow_participant_invites boolean DEFAULT true NOT NULL,
    visibility public.event_visibility DEFAULT 'VERIFIED_ROTARACTORS'::public.event_visibility NOT NULL,
    lock_leave_cutoff_hours integer DEFAULT 24 NOT NULL,
    cover_photo text,
    contact_number text,
    contact_email text,
    areas_of_focus public.area_of_focus[] DEFAULT '{}'::public.area_of_focus[],
    cancellation_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_24h_sent_at timestamp with time zone,
    reminder_1h_sent_at timestamp with time zone,
    geofence_radius_meters integer DEFAULT 300,
    district_review_requested_at timestamp with time zone,
    district_review_requested_by uuid,
    allocation_mode public.allocation_mode DEFAULT 'NONE'::public.allocation_mode NOT NULL,
    default_club_allocation integer,
    allocation_release_at timestamp with time zone,
    allocation_released_at timestamp with time zone,
    cohosting_enabled boolean DEFAULT false NOT NULL,
    cohosting_fee_centavos integer DEFAULT 0 NOT NULL,
    cohosting_max_clubs integer,
    cohosting_application_deadline timestamp with time zone,
    cohosting_requires_approval boolean DEFAULT true NOT NULL,
    cohosting_benefits text,
    CONSTRAINT events_cohosting_fee_centavos_check CHECK ((cohosting_fee_centavos >= 0)),
    CONSTRAINT events_cohosting_max_clubs_check CHECK (((cohosting_max_clubs IS NULL) OR (cohosting_max_clubs > 0))),
    CONSTRAINT events_default_club_allocation_check CHECK (((default_club_allocation IS NULL) OR (default_club_allocation >= 0)))
);

ALTER TABLE ONLY public.events REPLICA IDENTITY FULL;


--
-- Name: approve_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_event(p_event_id uuid) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_actor profiles;
  v_ev events;
  v_approver_clubs UUID[];
  v_approved UUID[];
BEGIN
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_ev FROM events WHERE id = p_event_id;
  IF v_ev.id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF v_ev.status <> 'PENDING_APPROVAL' THEN RETURN v_ev; END IF;

  -- A District Event is district-wide, so an Area Admin cannot approve it.
  IF v_ev.event_type = 'DISTRICT_EVENT' THEN
    IF v_actor.role NOT IN ('DISTRICT_ADMIN', 'APP_ADMIN') THEN
      RAISE EXCEPTION 'Only a District Administrator can approve a District Event';
    END IF;
    UPDATE events SET status = 'RECRUITING' WHERE id = p_event_id RETURNING * INTO v_ev;
    RETURN v_ev;
  END IF;

  -- Approvers = organizing club + the clubs of co-organizers / team members.
  -- Co-hosting partner clubs (event_participating_clubs) are intentionally NOT
  -- included: they lend their name without staffing the event, so requiring their
  -- President let a club stall an event it was not responsible for. Must stay in
  -- step with approverClubIdsFor() in src/utils/eventApproval.ts.
  SELECT ARRAY(
    SELECT DISTINCT c FROM unnest(
      ARRAY[v_ev.organizing_club_id]
      || COALESCE(ARRAY(SELECT club_id FROM profiles WHERE id = ANY(v_ev.co_organizer_user_ids) AND club_id IS NOT NULL), '{}')
    ) AS c WHERE c IS NOT NULL
  ) INTO v_approver_clubs;

  IF public.governs_club(auth.uid(), v_ev.organizing_club_id) THEN
    -- Admins can unblock a stalled approval outright.
    v_approved := v_approver_clubs;
  ELSIF v_actor.role = 'CLUB_PRESIDENT' AND v_actor.club_id = ANY(v_approver_clubs) THEN
    v_approved := ARRAY(
      SELECT DISTINCT u FROM unnest(COALESCE(v_ev.approved_by_club_ids, '{}') || v_actor.club_id) AS u
    );
  ELSE
    RAISE EXCEPTION 'You are not an approver for this event';
  END IF;

  UPDATE events
    SET approved_by_club_ids = v_approved,
        status = CASE
          WHEN NOT EXISTS (SELECT 1 FROM unnest(v_approver_clubs) AS c WHERE c <> ALL(v_approved))
          THEN 'RECRUITING'::event_status
          ELSE status
        END
    WHERE id = p_event_id
    RETURNING * INTO v_ev;

  RETURN v_ev;
END;
$$;


--
-- Name: can_manage_event(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_event(p_event_id uuid, p_user uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: event_cohosts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_cohosts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    club_id uuid NOT NULL,
    requested_by_user_id uuid,
    status public.cohost_status DEFAULT 'REQUESTED'::public.cohost_status NOT NULL,
    expected_participants integer DEFAULT 0 NOT NULL,
    agreed_fee_centavos integer DEFAULT 0 NOT NULL,
    message text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by_user_id uuid,
    review_notes text,
    payment_status public.cohost_payment_status DEFAULT 'NONE'::public.cohost_payment_status NOT NULL,
    payment_method text,
    payment_reference text,
    payment_receipt_path text,
    payment_submitted_at timestamp with time zone,
    payment_verified_at timestamp with time zone,
    payment_verified_by_user_id uuid,
    payment_review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_cohosts_agreed_fee_centavos_check CHECK ((agreed_fee_centavos >= 0)),
    CONSTRAINT event_cohosts_expected_participants_check CHECK ((expected_participants >= 0))
);


--
-- Name: cancel_cohost(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_cohost(p_cohost_id uuid, p_reason text DEFAULT NULL::text) RETURNS public.event_cohosts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: club_allocation_remaining(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.club_allocation_remaining(p_event_id uuid, p_club_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: create_event_with_clubs(jsonb, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_event_with_clubs(p_event jsonb, p_participating_club_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_actor profiles;
  v_ev events;
  v_club_id UUID;
BEGIN
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert the event row populated from jsonb fields
  INSERT INTO events (
    id,
    title,
    description,
    event_type,
    status,
    start_datetime,
    end_datetime,
    latitude,
    longitude,
    address,
    city,
    organizing_club_id,
    organizer_user_id,
    co_organizer_user_ids,
    max_participants,
    requires_approval,
    allow_participant_invites,
    visibility,
    cover_photo,
    contact_number,
    contact_email,
    areas_of_focus,
    lock_leave_cutoff_hours,
    approved_by_club_ids
  ) VALUES (
    COALESCE((p_event->>'id')::UUID, gen_random_uuid()),
    p_event->>'title',
    COALESCE(p_event->>'description', ''),
    (p_event->>'event_type')::event_type,
    COALESCE((p_event->>'status')::event_status, 'DRAFT'::event_status),
    (p_event->>'start_datetime')::TIMESTAMPTZ,
    (p_event->>'end_datetime')::TIMESTAMPTZ,
    (p_event->>'latitude')::DOUBLE PRECISION,
    (p_event->>'longitude')::DOUBLE PRECISION,
    p_event->>'address',
    COALESCE(p_event->>'city', ''),
    (p_event->>'organizing_club_id')::UUID,
    (p_event->>'organizer_user_id')::UUID,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_event->'co_organizer_user_ids')::UUID), '{}'),
    COALESCE((p_event->>'max_participants')::INTEGER, 0),
    COALESCE((p_event->>'requires_approval')::BOOLEAN, false),
    COALESCE((p_event->>'allow_participant_invites')::BOOLEAN, true),
    COALESCE((p_event->>'visibility')::event_visibility, 'VERIFIED_ROTARACTORS'::event_visibility),
    p_event->>'cover_photo',
    p_event->>'contact_number',
    p_event->>'contact_email',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_event->'areas_of_focus')::area_of_focus), '{}'),
    COALESCE((p_event->>'lock_leave_cutoff_hours')::INTEGER, 24),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_event->'approved_by_club_ids')::UUID), '{}')
  )
  RETURNING * INTO v_ev;

  -- Insert participating clubs if provided
  IF p_participating_club_ids IS NOT NULL AND array_length(p_participating_club_ids, 1) > 0 THEN
    FOREACH v_club_id IN ARRAY p_participating_club_ids LOOP
      IF v_club_id IS NOT NULL THEN
        INSERT INTO event_participating_clubs (event_id, club_id)
        VALUES (v_ev.id, v_club_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN v_ev;
END;
$$;


--
-- Name: dispatch_send_push_webhook(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_send_push_webhook() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'net', 'pg_temp'
    AS $$
DECLARE
  payload jsonb;
  target_url text := 'http://supabase-kong:8000/functions/v1/send-push';
BEGIN
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW)
  );

  PERFORM net.http_post(
    url := target_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;


--
-- Name: email_for_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.email_for_username(p_username text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT email FROM profiles WHERE lower(username) = lower(p_username) LIMIT 1;
$$;


--
-- Name: enforce_club_allocation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_club_allocation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: enforce_notification_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_notification_rate_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF current_user = 'authenticated' THEN
    SELECT count(*) INTO v_count
    FROM notifications
    WHERE created_by = auth.uid()
      AND created_at > now() - interval '1 minute';
    IF v_count >= 150 THEN
      RAISE EXCEPTION 'Notification rate limit exceeded — please slow down.'
        USING errcode = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: event_approver_club_ids(public.events); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_approver_club_ids(ev public.events) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT ARRAY(
    SELECT DISTINCT club_id FROM (
      SELECT ev.organizing_club_id AS club_id
      UNION
      SELECT epc.club_id FROM event_participating_clubs epc WHERE epc.event_id = ev.id
      UNION
      SELECT p.club_id FROM profiles p WHERE p.id = ANY(ev.co_organizer_user_ids)
    ) s WHERE club_id IS NOT NULL
  );
$$;


--
-- Name: governs_club(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.governs_club(p_user uuid, p_club uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN p.role IN ('APP_ADMIN', 'DISTRICT_ADMIN') THEN true
    WHEN p.role = 'DISTRICT_AREA_ADMIN' THEN EXISTS (
      SELECT 1
      FROM clubs target
      JOIN clubs own ON own.id = p.club_id
      WHERE target.id = p_club
        AND target.zone_id IS NOT NULL
        AND target.zone_id = own.zone_id
    )
    ELSE false
  END
  FROM profiles p
  WHERE p.id = p_user;
$$;


--
-- Name: guard_invitation_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_invitation_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.invited_user_id IS DISTINCT FROM OLD.invited_user_id
     OR NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id THEN
    RAISE EXCEPTION 'Invitation parties cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_verification_application_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_verification_application_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only reviewers can change application status';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: is_conversation_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_conversation_member(p_conv uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = p_conv
      AND (
        c.organizer_user_id = auth.uid()
        OR c.participant_user_id = auth.uid()
        OR (c.is_group AND EXISTS (
          SELECT 1 FROM event_participants ep
          WHERE ep.event_id = c.event_id
            AND ep.user_id = auth.uid()
            AND ep.status = 'JOINED'
        ))
      )
  );
$$;


--
-- Name: prune_push_deliveries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_push_deliveries() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM push_deliveries WHERE created_at < now() - interval '3 days';
$$;


--
-- Name: record_event_attendance(uuid, public.attendance_status, timestamp with time zone, double precision, double precision, integer, text, timestamp with time zone, double precision, double precision, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_event_attendance(p_participant_id uuid, p_attendance_status public.attendance_status DEFAULT NULL::public.attendance_status, p_checked_in_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_check_in_lat double precision DEFAULT NULL::double precision, p_check_in_lng double precision DEFAULT NULL::double precision, p_check_in_dist integer DEFAULT NULL::integer, p_check_in_method text DEFAULT NULL::text, p_checked_out_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_check_out_lat double precision DEFAULT NULL::double precision, p_check_out_lng double precision DEFAULT NULL::double precision, p_check_out_dist integer DEFAULT NULL::integer, p_check_out_method text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id uuid;
  v_participant public.event_participants%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_is_authorized boolean := false;
  v_caller_role public.user_role;
  v_caller_club uuid;
  v_check_in_enum public.check_in_method;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_participant FROM public.event_participants WHERE id = p_participant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant not found');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = v_participant.event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  -- Check Authorization: self, event organizer, co-organizers, club president, district/app admin
  SELECT role, club_id INTO v_caller_role, v_caller_club FROM public.profiles WHERE id = v_caller_id;

  IF v_caller_id = v_participant.user_id THEN
    v_is_authorized := true;
  ELSIF v_caller_id = v_event.organizer_user_id OR v_caller_id = ANY(v_event.co_organizer_user_ids) THEN
    v_is_authorized := true;
  ELSIF v_caller_role IN ('DISTRICT_ADMIN', 'APP_ADMIN') THEN
    v_is_authorized := true;
  ELSIF v_caller_role = 'CLUB_PRESIDENT' AND (
    v_caller_club = v_event.organizing_club_id
    OR EXISTS (SELECT 1 FROM public.event_participating_clubs WHERE event_id = v_event.id AND club_id = v_caller_club)
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized to modify attendance for this event');
  END IF;

  -- Parse check_in_method enum safely
  IF p_check_in_method IS NOT NULL THEN
    BEGIN
      v_check_in_enum := p_check_in_method::public.check_in_method;
    EXCEPTION WHEN OTHERS THEN
      v_check_in_enum := 'ORGANIZER'::public.check_in_method;
    END;
  END IF;

  -- Apply updates
  UPDATE public.event_participants
  SET
    attendance_status = COALESCE(p_attendance_status, attendance_status),
    checked_in_at = COALESCE(p_checked_in_at, checked_in_at),
    check_in_latitude = COALESCE(p_check_in_lat, check_in_latitude),
    check_in_longitude = COALESCE(p_check_in_lng, check_in_longitude),
    check_in_distance_m = COALESCE(p_check_in_dist, check_in_distance_m),
    check_in_method = COALESCE(v_check_in_enum, check_in_method),
    checked_out_at = COALESCE(p_checked_out_at, checked_out_at),
    check_out_latitude = COALESCE(p_check_out_lat, check_out_latitude),
    check_out_longitude = COALESCE(p_check_out_lng, check_out_longitude),
    check_out_distance_m = COALESCE(p_check_out_dist, check_out_distance_m),
    check_out_method = COALESCE(p_check_out_method, check_out_method)
  WHERE id = p_participant_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: release_club_allocations(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_club_allocations(p_event_id uuid) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: request_cohost(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_cohost(p_event_id uuid, p_expected_participants integer DEFAULT 0, p_message text DEFAULT NULL::text) RETURNS public.event_cohosts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: review_application(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_application(p_app_id uuid, p_action text, p_notes text DEFAULT ''::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: review_cohost(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_cohost(p_cohost_id uuid, p_action text, p_notes text DEFAULT NULL::text) RETURNS public.event_cohosts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: send_event_broadcast(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_event_broadcast(p_event_id uuid, p_title text, p_message text, p_priority text DEFAULT 'NORMAL'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ev events;
  v_actor profiles;
  v_conv_id UUID;
  v_body TEXT;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_ev FROM events WHERE id = p_event_id;
  IF v_ev.id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  -- Only the organizing team, the organizing club's President, or admins may broadcast.
  IF NOT (
    v_actor.id = v_ev.organizer_user_id
    OR v_actor.id = ANY(v_ev.co_organizer_user_ids)
    OR v_actor.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
    OR (v_actor.role = 'CLUB_PRESIDENT' AND v_actor.club_id = v_ev.organizing_club_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to broadcast to this event';
  END IF;

  IF p_priority NOT IN ('NORMAL', 'ALERT', 'HIGH') THEN
    RAISE EXCEPTION 'Invalid priority %', p_priority;
  END IF;
  IF length(coalesce(p_title, '')) = 0 OR length(p_title) > 120 THEN
    RAISE EXCEPTION 'Title must be 1-120 characters';
  END IF;
  IF length(coalesce(p_message, '')) > 1000 THEN
    RAISE EXCEPTION 'Message too long';
  END IF;

  -- Find (or lazily create) the event's single group conversation.
  SELECT id INTO v_conv_id FROM conversations WHERE event_id = p_event_id AND is_group LIMIT 1;
  IF v_conv_id IS NULL THEN
    INSERT INTO conversations (event_id, event_title, is_group, participant_user_id, organizer_user_id, last_message, last_message_at)
    VALUES (p_event_id, v_ev.title, true, NULL, v_ev.organizer_user_id, '', NOW())
    RETURNING id INTO v_conv_id;
  END IF;

  v_body := CASE WHEN length(coalesce(p_message, '')) > 0 THEN p_title || E'\n' || p_message ELSE p_title END;

  -- Post the announcement into the group chat (prefixed so it reads as a banner).
  -- is_broadcast keeps the direct_messages push webhook from double-notifying:
  -- the notification rows inserted just below already deliver this announcement.
  INSERT INTO direct_messages (conversation_id, event_id, sender_id, receiver_id, text, is_broadcast)
  VALUES (v_conv_id, p_event_id, auth.uid(), NULL, '📢 ' || v_body, true);
  UPDATE conversations SET last_message = '📢 ' || p_title, last_message_at = NOW() WHERE id = v_conv_id;

  -- Notify every JOINED participant, linking the notification to the group chat.
  INSERT INTO notifications (user_id, kind, title, message, event_id, conversation_id, priority)
  SELECT ep.user_id, 'EVENT_UPDATE', p_title, coalesce(nullif(p_message, ''), p_title), p_event_id, v_conv_id, p_priority
  FROM event_participants ep
  WHERE ep.event_id = p_event_id
    AND ep.status = 'JOINED'
    AND ep.user_id <> auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: send_event_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_event_reminders() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_ev events;
  v_total integer := 0;
  v_rows integer := 0;
BEGIN
  -- ---- T-24h reminders: events starting within the next 24h, not yet reminded.
  FOR v_ev IN
    SELECT * FROM events
    WHERE reminder_24h_sent_at IS NULL
      AND status NOT IN ('CANCELLED', 'COMPLETED', 'DRAFT', 'PENDING_APPROVAL')
      AND start_datetime > now()
      AND start_datetime <= now() + interval '24 hours'
  LOOP
    INSERT INTO notifications (user_id, kind, title, message, event_id, priority)
    SELECT ep.user_id, 'EVENT_REMINDER', 'Event tomorrow: ' || v_ev.title,
           '"' || v_ev.title || '" starts within 24 hours. Tap for details.',
           v_ev.id, 'NORMAL'
    FROM event_participants ep
    WHERE ep.event_id = v_ev.id AND ep.status = 'JOINED';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
    UPDATE events SET reminder_24h_sent_at = now() WHERE id = v_ev.id;
  END LOOP;

  -- ---- T-1h reminders: events starting within the next hour, not yet reminded.
  FOR v_ev IN
    SELECT * FROM events
    WHERE reminder_1h_sent_at IS NULL
      AND status NOT IN ('CANCELLED', 'COMPLETED', 'DRAFT', 'PENDING_APPROVAL')
      AND start_datetime > now()
      AND start_datetime <= now() + interval '1 hour'
  LOOP
    INSERT INTO notifications (user_id, kind, title, message, event_id, priority)
    SELECT ep.user_id, 'EVENT_REMINDER', 'Starting soon: ' || v_ev.title,
           '"' || v_ev.title || '" starts within the hour. See you there!',
           v_ev.id, 'ALERT'
    FROM event_participants ep
    WHERE ep.event_id = v_ev.id AND ep.status = 'JOINED';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
    UPDATE events SET reminder_1h_sent_at = now() WHERE id = v_ev.id;
  END LOOP;

  RETURN v_total;
END;
$$;


--
-- Name: event_club_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_club_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    club_id uuid NOT NULL,
    allocated_slots integer DEFAULT 0 NOT NULL,
    initial_slots integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_club_allocations_allocated_slots_check CHECK ((allocated_slots >= 0)),
    CONSTRAINT event_club_allocations_initial_slots_check CHECK ((initial_slots >= 0))
);


--
-- Name: set_club_allocation(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_club_allocation(p_event_id uuid, p_club_id uuid, p_slots integer) RETURNS public.event_club_allocations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: submit_cohost_payment(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_cohost_payment(p_cohost_id uuid, p_method text, p_reference text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text) RETURNS public.event_cohosts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: touch_event_club_allocation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_event_club_allocation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: touch_event_cohost(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_event_cohost() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: unsend_message(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unsend_message(p_message_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_msg direct_messages;
BEGIN
  SELECT * INTO v_msg FROM direct_messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN RAISE EXCEPTION 'Message not found'; END IF;
  IF v_msg.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only unsend your own messages';
  END IF;
  UPDATE direct_messages
    SET deleted_at = NOW(), text = '', attachment_path = NULL, attachment_type = NULL
    WHERE id = p_message_id;
END;
$$;


--
-- Name: upsert_cohost_allocation(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_cohost_allocation(p_event_id uuid, p_club_id uuid, p_slots integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.event_club_allocations (event_id, club_id, allocated_slots, initial_slots)
  VALUES (p_event_id, p_club_id, p_slots, p_slots)
  ON CONFLICT (event_id, club_id) DO UPDATE
    SET allocated_slots = GREATEST(public.event_club_allocations.allocated_slots, EXCLUDED.allocated_slots);
END;
$$;


--
-- Name: verify_cohost_payment(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_cohost_payment(p_cohost_id uuid, p_action text, p_notes text DEFAULT NULL::text) RETURNS public.event_cohosts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid,
    action text NOT NULL,
    performed_by_name text NOT NULL,
    performed_by_role public.user_role NOT NULL,
    previous_status text,
    new_status text,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text,
    event_id uuid,
    target_user_id uuid,
    target_name text,
    CONSTRAINT audit_logs_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['ROLE'::text, 'EVENT'::text, 'VERIFICATION'::text, 'ATTENDANCE'::text, 'SYSTEM'::text]))))
);

ALTER TABLE ONLY public.audit_logs REPLICA IDENTITY FULL;


--
-- Name: clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clubs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    club_name text NOT NULL,
    club_code text NOT NULL,
    zone_id uuid,
    city text NOT NULL,
    province text DEFAULT 'Metro Manila'::text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    description text DEFAULT ''::text,
    member_count integer DEFAULT 0 NOT NULL,
    president_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    club_type text DEFAULT 'COMMUNITY_BASED'::text,
    institution_name text,
    email text,
    meeting_address text
);

ALTER TABLE ONLY public.clubs REPLICA IDENTITY FULL;


--
-- Name: conversation_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_states (
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    muted boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.conversation_states REPLICA IDENTITY FULL;


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    event_title text,
    is_group boolean DEFAULT false NOT NULL,
    participant_user_id uuid,
    organizer_user_id uuid NOT NULL,
    last_message text DEFAULT ''::text,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.conversations REPLICA IDENTITY FULL;


--
-- Name: direct_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    event_id uuid,
    sender_id uuid NOT NULL,
    receiver_id uuid,
    text text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment_path text,
    attachment_type text,
    deleted_at timestamp with time zone,
    is_broadcast boolean DEFAULT false NOT NULL,
    mentioned_user_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    attachment_width integer,
    attachment_height integer,
    reply_to_message_id uuid,
    reply_to_sender_name text,
    reply_to_text text
);

ALTER TABLE ONLY public.direct_messages REPLICA IDENTITY FULL;


--
-- Name: event_impacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_impacts (
    event_id uuid NOT NULL,
    volunteer_hours integer DEFAULT 0 NOT NULL,
    beneficiaries integer DEFAULT 0 NOT NULL,
    funds_raised numeric(12,2) DEFAULT 0.00 NOT NULL,
    items_distributed integer DEFAULT 0 NOT NULL,
    trees_planted integer DEFAULT 0 NOT NULL,
    impact_summary text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    invited_user_id uuid NOT NULL,
    invited_by_user_id uuid NOT NULL,
    status public.invitation_status DEFAULT 'PENDING'::public.invitation_status NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    decline_reason text
);


--
-- Name: event_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status public.participation_status DEFAULT 'PENDING'::public.participation_status NOT NULL,
    attendance_status public.attendance_status DEFAULT 'NOT_MARKED'::public.attendance_status NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_in_at timestamp with time zone,
    check_in_latitude double precision,
    check_in_longitude double precision,
    check_in_distance_m double precision,
    check_in_method public.check_in_method DEFAULT 'SELF_GPS'::public.check_in_method NOT NULL,
    checked_out_at timestamp with time zone,
    check_out_latitude double precision,
    check_out_longitude double precision,
    check_out_distance_m double precision,
    check_out_method text
);

ALTER TABLE ONLY public.event_participants REPLICA IDENTITY FULL;


--
-- Name: COLUMN event_participants.checked_out_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_participants.checked_out_at IS 'When the participant checked out of the event on-site, manually, or via 60-minute perimeter auto-leave';


--
-- Name: COLUMN event_participants.check_out_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.event_participants.check_out_method IS 'Method of check-out: SELF_GPS, AUTO_PERIMETER_LEAVE, or ORGANIZER';


--
-- Name: event_participating_clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_participating_clubs (
    event_id uuid NOT NULL,
    club_id uuid NOT NULL
);

ALTER TABLE ONLY public.event_participating_clubs REPLICA IDENTITY FULL;


--
-- Name: message_deletions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_deletions (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.message_deletions REPLICA IDENTITY FULL;


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id text NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.message_reactions REPLICA IDENTITY FULL;


--
-- Name: message_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reads (
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL,
    last_read_message_id uuid
);

ALTER TABLE ONLY public.message_reads REPLICA IDENTITY FULL;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind public.notification_kind NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    event_id uuid,
    application_id uuid,
    conversation_id uuid,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    priority text DEFAULT 'NORMAL'::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    CONSTRAINT notifications_priority_check CHECK ((priority = ANY (ARRAY['NORMAL'::text, 'ALERT'::text, 'HIGH'::text])))
);

ALTER TABLE ONLY public.notifications REPLICA IDENTITY FULL;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    username text NOT NULL,
    club_id uuid,
    "position" text DEFAULT 'Member'::text NOT NULL,
    role public.user_role DEFAULT 'MEMBER'::public.user_role NOT NULL,
    verification_status public.verification_status DEFAULT 'PENDING'::public.verification_status NOT NULL,
    avatar_url text,
    contact_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    allow_direct_inquiries boolean DEFAULT true NOT NULL,
    contact_privacy text DEFAULT 'ALL_VERIFIED'::text,
    system_role text DEFAULT 'NONE'::text,
    club_role text DEFAULT 'MEMBER'::text,
    last_latitude double precision,
    last_longitude double precision,
    last_location_at timestamp with time zone,
    signature_url text,
    gender text,
    CONSTRAINT profiles_club_role_check CHECK ((club_role = ANY (ARRAY['CLUB_PRESIDENT'::text, 'OFFICER'::text, 'MEMBER'::text]))),
    CONSTRAINT profiles_system_role_check CHECK ((system_role = ANY (ARRAY['APP_ADMIN'::text, 'DISTRICT_ADMIN'::text, 'DISTRICT_AREA_ADMIN'::text, 'NONE'::text])))
);

ALTER TABLE ONLY public.profiles REPLICA IDENTITY FULL;


--
-- Name: COLUMN profiles.allow_direct_inquiries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.allow_direct_inquiries IS 'When false, only same-club members may start a new 1-on-1 conversation with this user.';


--
-- Name: push_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_deliveries (
    dedupe_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    token text NOT NULL,
    user_id uuid NOT NULL,
    platform text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    device_token text
);


--
-- Name: COLUMN push_tokens.device_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.push_tokens.device_token IS 'Raw FCM registration token (Android only). Null on iOS, which delivers via Expo/APNs.';


--
-- Name: verification_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    club_id uuid NOT NULL,
    member_id text NOT NULL,
    "position" text DEFAULT 'Member'::text NOT NULL,
    status public.verification_status DEFAULT 'AWAITING_CLUB_VALIDATION'::public.verification_status NOT NULL,
    proof_url text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text DEFAULT ''::text
);


--
-- Name: zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    zone_number integer NOT NULL,
    zone_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.zones REPLICA IDENTITY FULL;


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, application_id, action, performed_by_name, performed_by_role, previous_status, new_status, notes, created_at, category, event_id, target_user_id, target_name) FROM stdin;
e3455770-5393-59aa-a5e1-982531241baa	46ca3053-cdf5-58dc-afdf-3e10c7192cb6	CLUB_VALIDATE	Ramil Navarro	CLUB_PRESIDENT	AWAITING_CLUB_VALIDATION	AWAITING_ADMIN_VERIFICATION	Verified member per club roster.	2026-08-07 10:00:00+00	\N	\N	\N	\N
8d61a24b-bb6b-5687-a47b-40beb5e1eccb	2cd20bfd-9067-56fe-942d-1eb18c2d3c26	CLUB_VALIDATE	Oscar Delacruz	CLUB_PRESIDENT	AWAITING_CLUB_VALIDATION	AWAITING_ADMIN_VERIFICATION		2026-08-05 10:00:00+00	\N	\N	\N	\N
0a9dc6b3-74ac-53fe-98bb-89600b051265	46ca3053-cdf5-58dc-afdf-3e10c7192cb6	ADMIN_APPROVE	Patricia Gomez	APP_ADMIN	AWAITING_ADMIN_VERIFICATION	VERIFIED	Final verification complete.	2026-08-08 09:00:00+00	\N	\N	\N	\N
\.


--
-- Data for Name: clubs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.clubs (id, club_name, club_code, zone_id, city, province, latitude, longitude, description, member_count, president_id, created_at, club_type, institution_name, email, meeting_address) FROM stdin;
22222222-2222-2222-2222-222222222201	Rotaract Club of Valenzuela	RC-3800-021	11111111-1111-1111-1111-111111111103	Valenzuela	Metro Manila	14.7	120.9822	Youth service and leadership across Valenzuela City since 2011.	48	8ac9d561-2d0a-55be-9228-7866e89508b7	2026-08-30 06:18:29.423075+00	COMMUNITY_BASED	\N	\N	\N
22222222-2222-2222-2222-222222222202	Rotaract Club of Malabon	RC-3800-022	11111111-1111-1111-1111-111111111101	Malabon	Metro Manila	14.657	120.9569	Serving the historic riverside communities of Malabon.	33	8e4b923d-1889-5ab5-9180-3d098b44b0a0	2026-08-30 06:18:29.423075+00	COMMUNITY_BASED	\N	\N	\N
22222222-2222-2222-2222-222222222203	Rotaract Club of Caloocan	RC-3800-023	11111111-1111-1111-1111-111111111102	Caloocan	Metro Manila	14.6499	120.967	Driving community and environmental projects across Caloocan.	41	c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070	2026-08-30 06:18:29.423075+00	COMMUNITY_BASED	\N	\N	\N
22222222-2222-2222-2222-222222222204	Rotaract Club of Marikina	RC-3800-024	11111111-1111-1111-1111-111111111104	Marikina	Metro Manila	14.6507	121.1029	Building compassionate young leaders in the Shoe Capital.	52	74eed248-aa8d-58be-8be2-599608be879d	2026-08-30 06:18:29.423075+00	COMMUNITY_BASED	\N	\N	\N
22222222-2222-2222-2222-222222222205	Rotaract Club of Mandaluyong	RC-3800-025	11111111-1111-1111-1111-111111111108	Mandaluyong	Metro Manila	14.5794	121.0359	A growing family of young professionals serving Mandaluyong.	37	0c82c113-cdb5-548f-82e0-8305b30fe505	2026-08-30 06:18:29.423075+00	COMMUNITY_BASED	\N	\N	\N
\.


--
-- Data for Name: conversation_states; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversation_states (conversation_id, user_id, pinned, archived, deleted_at, updated_at, muted) FROM stdin;
9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	fdd68780-e899-5cdf-b28c-d5584b1bdd05	f	f	2026-08-30 10:47:04.733+00	2026-08-30 10:47:04.741+00	f
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conversations (id, event_id, event_title, is_group, participant_user_id, organizer_user_id, last_message, last_message_at, created_at) FROM stdin;
dc938108-cd1e-5061-939b-4ec4a6e9009f	7280b543-08eb-52a2-b912-00e67a06d6b9	Tullahan Riverbank Cleanup	f	f14a7e10-1e84-5adc-90ae-949fba6c64a2	8ac9d561-2d0a-55be-9228-7866e89508b7	Hi President Andrea! Will there be parking near the Tullahan riverbank site?	2026-08-11 13:30:00+00	2026-08-30 06:18:29.423075+00
ecd8c4fb-375c-5a3f-81b4-f54de96e7bfd	7280b543-08eb-52a2-b912-00e67a06d6b9	Tullahan Riverbank Cleanup	t	\N	8ac9d561-2d0a-55be-9228-7866e89508b7	President Andrea: We're set up at the main tent — grab gloves and bags!	2026-08-11 13:40:00+00	2026-08-30 06:18:29.423075+00
6343e04d-6b0d-59ee-a11b-bf9072706575	bb935735-4116-57ad-9075-8e4fd3d33be7	Back-to-School Supply Drive	t	\N	8ac9d561-2d0a-55be-9228-7866e89508b7	Camille Bautista: I've sorted the notebooks by grade level.	2026-08-10 09:15:00+00	2026-08-30 06:18:29.423075+00
9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	\N	f	fdd68780-e899-5cdf-b28c-d5584b1bdd05	f14a7e10-1e84-5adc-90ae-949fba6c64a2	Yow	2026-08-30 07:47:11.591+00	2026-08-30 07:05:42.909347+00
64dcdebf-1173-46dd-a748-b47425669f35	\N	\N	f	fdd68780-e899-5cdf-b28c-d5584b1bdd05	fdd68780-e899-5cdf-b28c-d5584b1bdd05		2026-08-30 10:05:53.889+00	2026-08-30 10:05:54.502578+00
\.


--
-- Data for Name: direct_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.direct_messages (id, conversation_id, event_id, sender_id, receiver_id, text, created_at, attachment_path, attachment_type, deleted_at, is_broadcast, mentioned_user_ids, attachment_width, attachment_height, reply_to_message_id, reply_to_sender_name, reply_to_text) FROM stdin;
70ab825b-1e99-5959-8452-2ad83bfca24f	dc938108-cd1e-5061-939b-4ec4a6e9009f	7280b543-08eb-52a2-b912-00e67a06d6b9	f14a7e10-1e84-5adc-90ae-949fba6c64a2	8ac9d561-2d0a-55be-9228-7866e89508b7	Hi President Andrea! Will there be parking near the Tullahan riverbank site?	2026-08-11 13:30:00+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
7e9cb7e6-f1e3-5aca-92bb-bc5d3fa37418	ecd8c4fb-375c-5a3f-81b4-f54de96e7bfd	7280b543-08eb-52a2-b912-00e67a06d6b9	8ac9d561-2d0a-55be-9228-7866e89508b7	\N	We're set up at the main tent — grab gloves and bags!	2026-08-11 13:40:00+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
9e35d31e-39d6-57f4-8b12-2c9b17d6491b	6343e04d-6b0d-59ee-a11b-bf9072706575	bb935735-4116-57ad-9075-8e4fd3d33be7	c16e6c94-67cf-5163-9fb4-7bff3056e618	\N	I've sorted the notebooks by grade level.	2026-08-10 09:15:00+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
dbf9726a-0331-419c-b9b3-339ee1927601	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! How is your day going? Testing push notifications!	2026-08-30 07:05:42.909347+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
7d8b696d-3d7b-4bb4-9870-06d8eb686203	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! How is your day going? Testing push notifications!	2026-08-30 07:06:10.246543+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
baf079c7-7012-4b33-9e92-70b589a98c3c	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! How is your day going? Testing push notifications!	2026-08-30 07:08:59.030532+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
35ec9a6b-570c-41fa-990f-e6ea8b1ff0f3	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! Are you free to review the upcoming club project agenda? 📋	2026-08-30 07:28:27.437656+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
bfb6ea2d-00bf-4a50-aada-4c87ce947969	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! Are you free to review the upcoming club project agenda? 📋	2026-08-30 07:34:14.733866+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
58980b0a-a7d5-4075-a081-7c0ce5222704	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! Are you free to review the upcoming club project agenda? 📋	2026-08-30 07:36:39.44943+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
40987e6a-f938-49ad-8fc8-927f6082f112	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! Are you free to review the upcoming club project agenda? 📋	2026-08-30 07:46:42.041512+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
c00df0d6-4c98-4ede-8122-3fde69e14c09	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	fdd68780-e899-5cdf-b28c-d5584b1bdd05	f14a7e10-1e84-5adc-90ae-949fba6c64a2	Yow	2026-08-30 07:47:11.591+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
095eab0b-0a93-476c-b31c-16a9c9d92795	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! Are you free to review the upcoming club project agenda? 📋	2026-08-30 10:08:08.081465+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
48f81e29-0ada-409e-b6f9-3f59650cde15	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! Are you free to review the upcoming club project agenda? 📋	2026-08-30 10:10:18.272857+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
aa8235f9-0029-4373-b607-4c1ce8461ba5	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:24:26.029263+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
49e9d2f3-22af-41e7-ad79-be01c2358420	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:24:59.232833+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
1058bae7-c00d-4fa9-af76-1f120fe9269a	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:25:06.153629+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
aed550b7-60c0-43dd-aadf-7eef1c6fbc89	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:25:19.95557+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
7c1a5e44-acb0-4e93-a5d2-e249a3ff5232	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:25:49.430907+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
cbb650ec-b8a6-40c0-a62c-2e029d37df74	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:26:04.549789+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
7b3bd00a-0da9-42dd-a531-2e2631bb3b42	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:33:18.884517+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
5c8a2ab7-27eb-4182-a10b-180cfe6e60be	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:33:33.17254+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
a63a3040-4580-41b7-985e-644900dc68ed	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:33:43.373764+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
740f0ade-9f37-4ec8-8fe3-88582ee0e816	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:34:50.742783+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
17f6c462-496b-49a5-b4e5-5f756b1c8b25	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hello Patricia! Test push notification from Supabase.	2026-08-30 10:35:05.722136+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
5e74b090-5468-4839-91af-9bb9ed040236	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Testing FCM background push!	2026-08-30 10:47:06.610839+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
9d39d01a-7613-4285-bd7d-a9be6e766454	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Testing FCM background push!	2026-08-30 10:47:23.368644+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
4128d0a1-ee13-4fb8-ae78-bd74a9318984	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Testing FCM background push!	2026-08-30 10:47:55.63495+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
f5dbdd3f-d9ef-4962-869b-a0ecc87ba9e8	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! This is a rich messenger notification.	2026-08-30 10:49:20.666815+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
cfe88e86-fb4a-4c5e-ae70-d1d67c2d7e7a	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! This is a rich messenger notification.	2026-08-30 10:49:35.412523+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
e2bbd66f-dab0-47df-b54c-8e872f6ce45d	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	\N	f14a7e10-1e84-5adc-90ae-949fba6c64a2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	Hey Patricia! This is a rich messenger notification.	2026-08-30 10:58:58.013329+00	\N	\N	\N	f	{}	\N	\N	\N	\N	\N
\.


--
-- Data for Name: event_club_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_club_allocations (id, event_id, club_id, allocated_slots, initial_slots, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_cohosts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_cohosts (id, event_id, club_id, requested_by_user_id, status, expected_participants, agreed_fee_centavos, message, requested_at, reviewed_at, reviewed_by_user_id, review_notes, payment_status, payment_method, payment_reference, payment_receipt_path, payment_submitted_at, payment_verified_at, payment_verified_by_user_id, payment_review_notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_impacts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_impacts (event_id, volunteer_hours, beneficiaries, funds_raised, items_distributed, trees_planted, impact_summary, created_at) FROM stdin;
78d5164d-9f80-5fb6-9d46-648c7869c6f1	52	140	0.00	0	0	42 blood bags collected, aiding the regional blood bank's trauma and maternity reserves.	2026-08-30 06:18:29.423075+00
2f8d8834-1acd-5946-9027-61e703e2b21c	96	0	0.00	0	500	500 native seedlings planted along the Tullahan riverbank buffer.	2026-08-30 06:18:29.423075+00
\.


--
-- Data for Name: event_invitations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_invitations (id, event_id, invited_user_id, invited_by_user_id, status, sent_at, decline_reason) FROM stdin;
f083c5b5-489c-5738-a4ff-9a062095db62	843649b8-f504-5334-a2e0-e27c37609476	f14a7e10-1e84-5adc-90ae-949fba6c64a2	0c82c113-cdb5-548f-82e0-8305b30fe505	PENDING	2026-08-08 10:00:00+00	\N
27e9b8ea-b15a-51a9-ab68-32c961f02215	4bb077a7-abbd-5a6d-9b8a-9c31b7a180cd	f14a7e10-1e84-5adc-90ae-949fba6c64a2	74eed248-aa8d-58be-8be2-599608be879d	PENDING	2026-08-09 10:00:00+00	\N
\.


--
-- Data for Name: event_participants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method, checked_out_at, check_out_latitude, check_out_longitude, check_out_distance_m, check_out_method) FROM stdin;
e0a10ff0-1057-573a-a979-15d5be5a044f	7280b543-08eb-52a2-b912-00e67a06d6b9	8ac9d561-2d0a-55be-9228-7866e89508b7	JOINED	NOT_MARKED	2026-08-10 00:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
ff54bfcd-0477-5090-917b-0f81bb571c9a	51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd	c16e6c94-67cf-5163-9fb4-7bff3056e618	JOINED	NOT_MARKED	2026-08-10 00:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
1da91ef4-b73a-51cd-a0e5-a52e8ca3f556	51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd	7ae426d1-252c-5051-9c97-b583c802d57f	JOINED	NOT_MARKED	2026-08-10 00:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
d1a77fd7-9b10-5b72-9821-e6f6638ebd2c	51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd	6112ecdc-a022-5175-a9b7-e04bb794b078	JOINED	NOT_MARKED	2026-08-10 00:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
b77afa09-3618-5f90-ae94-36872144ebb8	bb935735-4116-57ad-9075-8e4fd3d33be7	8ac9d561-2d0a-55be-9228-7866e89508b7	JOINED	NOT_MARKED	2026-08-04 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
13cb11f1-c825-536e-a174-aa845d542900	cd6c41fe-4854-5a5f-af7d-89c720aea859	c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070	JOINED	NOT_MARKED	2026-08-04 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
0c319d28-01e8-5d7b-a28f-0a50b983e4be	4bb077a7-abbd-5a6d-9b8a-9c31b7a180cd	74eed248-aa8d-58be-8be2-599608be879d	JOINED	NOT_MARKED	2026-08-04 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
4bbee730-6462-5aaf-bf8c-5505e41f84fe	2f8d8834-1acd-5946-9027-61e703e2b21c	c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070	JOINED	ATTENDED	2026-08-01 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
9b26e8f3-b295-5306-88b5-0c0dd18520d8	843649b8-f504-5334-a2e0-e27c37609476	0c82c113-cdb5-548f-82e0-8305b30fe505	JOINED	NOT_MARKED	2026-08-04 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
041ef928-a5e0-5f20-a6ea-e42ae22a8448	78d5164d-9f80-5fb6-9d46-648c7869c6f1	8ac9d561-2d0a-55be-9228-7866e89508b7	JOINED	ATTENDED	2026-07-05 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
ec940c4e-efcd-58d6-88c5-e4202269d9dd	dc933450-4842-5d19-8771-b4ed36d42167	8ac9d561-2d0a-55be-9228-7866e89508b7	JOINED	NOT_MARKED	2026-08-04 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
ae3615c9-d70b-53de-9567-c1afb0dea0e3	4dd3a724-95ad-504e-99db-da07c976092d	8ac9d561-2d0a-55be-9228-7866e89508b7	JOINED	NOT_MARKED	2026-08-10 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
18a9e0f0-58a4-58c2-b91b-f9bfc6295ed0	bb935735-4116-57ad-9075-8e4fd3d33be7	c16e6c94-67cf-5163-9fb4-7bff3056e618	JOINED	NOT_MARKED	2026-08-04 10:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
8ad3c7af-4262-526b-940b-4b8171ccc1b5	bb935735-4116-57ad-9075-8e4fd3d33be7	8bea3bd8-837a-5bfc-8dc9-a202e96d258e	JOINED	NOT_MARKED	2026-08-05 10:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
550bbcd8-3f5e-54b0-a18d-cacde00e3ff4	2f8d8834-1acd-5946-9027-61e703e2b21c	f14a7e10-1e84-5adc-90ae-949fba6c64a2	JOINED	ATTENDED	2026-08-01 10:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
d801d2d8-77af-50f6-97bc-426c9ddfe49b	78d5164d-9f80-5fb6-9d46-648c7869c6f1	f14a7e10-1e84-5adc-90ae-949fba6c64a2	JOINED	ATTENDED	2026-07-05 10:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
2d3687d4-6942-59e8-a65c-7a1c2472023a	78d5164d-9f80-5fb6-9d46-648c7869c6f1	c16e6c94-67cf-5163-9fb4-7bff3056e618	JOINED	ATTENDED	2026-07-05 10:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
a515fe86-26f1-5146-88d3-f33f9cbb888a	cd6c41fe-4854-5a5f-af7d-89c720aea859	f14a7e10-1e84-5adc-90ae-949fba6c64a2	PENDING	NOT_MARKED	2026-08-05 10:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
e8cf66ab-2576-5406-aac0-aa9443c16bb7	7280b543-08eb-52a2-b912-00e67a06d6b9	f14a7e10-1e84-5adc-90ae-949fba6c64a2	JOINED	NOT_MARKED	2026-08-11 08:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
d1e7efa3-64cd-5478-8ca9-3e22e02819dd	7280b543-08eb-52a2-b912-00e67a06d6b9	c16e6c94-67cf-5163-9fb4-7bff3056e618	JOINED	NOT_MARKED	2026-08-11 08:05:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
a87fd476-cb3a-5d2f-945a-1c1fb0690983	144bf03f-701d-5c8b-9d02-6c26ca362fcf	f14a7e10-1e84-5adc-90ae-949fba6c64a2	JOINED	NOT_MARKED	2026-08-11 08:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
5d2e4017-31eb-53fd-b348-7615d78801d3	144bf03f-701d-5c8b-9d02-6c26ca362fcf	8ac9d561-2d0a-55be-9228-7866e89508b7	JOINED	NOT_MARKED	2026-08-11 08:05:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
d3fca955-2b38-5a19-9adf-7effd2767e68	144bf03f-701d-5c8b-9d02-6c26ca362fcf	bec716c6-d773-5c72-8568-934ec9566d2d	JOINED	NOT_MARKED	2026-08-11 08:10:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
5272b007-9911-55ad-b7c7-633ffad83edb	144bf03f-701d-5c8b-9d02-6c26ca362fcf	fdd68780-e899-5cdf-b28c-d5584b1bdd05	JOINED	NOT_MARKED	2026-08-11 08:15:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
c75f00be-8ee6-5405-8c33-90ff429dd3cc	51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd	f14a7e10-1e84-5adc-90ae-949fba6c64a2	JOINED	NOT_MARKED	2026-08-11 08:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
8e1cb6e6-075a-595c-8960-2c6867df85e1	4dd3a724-95ad-504e-99db-da07c976092d	f14a7e10-1e84-5adc-90ae-949fba6c64a2	JOINED	NOT_MARKED	2026-08-11 09:00:00+00	\N	\N	\N	\N	SELF_GPS	\N	\N	\N	\N	\N
\.


--
-- Data for Name: event_participating_clubs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_participating_clubs (event_id, club_id) FROM stdin;
\.


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus, cancellation_reason, created_at, updated_at, reminder_24h_sent_at, reminder_1h_sent_at, geofence_radius_meters, district_review_requested_at, district_review_requested_by, allocation_mode, default_club_allocation, allocation_release_at, allocation_released_at, cohosting_enabled, cohosting_fee_centavos, cohosting_max_clubs, cohosting_application_deadline, cohosting_requires_approval, cohosting_benefits) FROM stdin;
7280b543-08eb-52a2-b912-00e67a06d6b9	Tullahan Riverbank Cleanup	Community cleanup along the Tullahan River. Volunteers gather for waste segregation, silt clearing, and riverbank restoration.	SERVICE_PROJECT	ONGOING	2026-08-15 11:51:53.485+00	2026-08-15 14:51:53.486+00	14.7	120.9822	Tullahan Riverbank, Brgy. Malanday	Valenzuela	22222222-2222-2222-2222-222222222201	8ac9d561-2d0a-55be-9228-7866e89508b7	{}	{}	60	f	t	VERIFIED_ROTARACTORS	6	https://images.unsplash.com/photo-1618477388954-7852f32655ec?w=800&q=80	+63 917 550 1120	events@racvalenzuela.org	{ENVIRONMENT}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
144bf03f-701d-5c8b-9d02-6c26ca362fcf	Community Health Caravan	Free medical and dental check-ups, blood pressure screening, and health education at the Valenzuela People's Park covered court. Includes on-site check-in and live attendance tracking.	SERVICE_PROJECT	ONGOING	2026-08-15 11:41:53.486+00	2026-08-15 19:56:53.486+00	14.7	120.9822	Valenzuela People's Park Covered Court	Valenzuela	22222222-2222-2222-2222-222222222201	8ac9d561-2d0a-55be-9228-7866e89508b7	{}	{}	50	f	t	VERIFIED_ROTARACTORS	12	https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80	+63 917 550 1120	events@racvalenzuela.org	{DISEASE_PREVENTION,COMMUNITY_DEVELOPMENT}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd	CAMANAVA Riverways Cleanup	A joint CAMANAVA project between Valenzuela, Malabon and Caloocan along the Malabon–Navotas river system. Awaiting sign-off from all three club Presidents.	SERVICE_PROJECT	PENDING_APPROVAL	2026-09-19 01:00:00+00	2026-09-19 06:00:00+00	14.657	120.9569	Malabon–Navotas Riverbank, Brgy. Tañong	Malabon	22222222-2222-2222-2222-222222222201	c16e6c94-67cf-5163-9fb4-7bff3056e618	{7ae426d1-252c-5051-9c97-b583c802d57f,6112ecdc-a022-5175-a9b7-e04bb794b078}	{22222222-2222-2222-2222-222222222202}	120	f	t	VERIFIED_ROTARACTORS	24	\N	\N	\N	{ENVIRONMENT}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
bb935735-4116-57ad-9075-8e4fd3d33be7	Back-to-School Supply Drive	Packing and handing out school kits — notebooks, pencils, and bags — to 150 public-school pupils ahead of the new term.	SERVICE_PROJECT	RECRUITING	2026-08-29 01:00:00+00	2026-08-29 05:00:00+00	14.7	120.9822	Valenzuela Elementary School	Valenzuela	22222222-2222-2222-2222-222222222201	8ac9d561-2d0a-55be-9228-7866e89508b7	{}	{}	80	f	t	VERIFIED_ROTARACTORS	24	https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80	+63 917 550 1120	projects@racvalenzuela.org	{EDUCATION_LITERACY,COMMUNITY_DEVELOPMENT}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
cd6c41fe-4854-5a5f-af7d-89c720aea859	Zone 2 Fellowship Night	Casual dinner, team-building trivia, and games with fellow Rotaractors from Zone 2. Bring a friend!	FELLOWSHIP	SCHEDULED	2026-08-21 11:00:00+00	2026-08-21 14:00:00+00	14.6499	120.967	Caloocan Sports Complex	Caloocan	22222222-2222-2222-2222-222222222203	c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070	{}	{}	60	t	t	VERIFIED_ROTARACTORS	12	https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&q=80	+63 920 118 7764	fellowship@raccaloocan.org	{}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
4bb077a7-abbd-5a6d-9b8a-9c31b7a180cd	Feeding Program — Barangay Nangka	Serving hot, nutritious meals to 200 children in Barangay Nangka. Volunteers needed for food prep, serving, and storytelling.	SERVICE_PROJECT	RECRUITING	2026-08-27 01:00:00+00	2026-08-27 06:00:00+00	14.6507	121.1029	Barangay Nangka Covered Court	Marikina	22222222-2222-2222-2222-222222222204	74eed248-aa8d-58be-8be2-599608be879d	{}	{}	30	f	f	VERIFIED_ROTARACTORS	24	https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&q=80	+63 921 245 6603	community@racmarikina.org	{MATERNAL_CHILD_HEALTH,COMMUNITY_DEVELOPMENT}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
2f8d8834-1acd-5946-9027-61e703e2b21c	Riverside Tree Planting	Reforestation along the Tullahan riverbank buffer, planting 500 native seedlings to stabilize the banks and improve water quality.	SERVICE_PROJECT	COMPLETED	2026-08-08 22:00:00+00	2026-08-09 07:00:00+00	14.6499	120.967	Tullahan Riverbank Buffer, Caloocan	Caloocan	22222222-2222-2222-2222-222222222203	c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070	{}	{}	100	f	t	VERIFIED_ROTARACTORS	6	https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&q=80	+63 920 118 7764	eco@raccaloocan.org	{ENVIRONMENT}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
843649b8-f504-5334-a2e0-e27c37609476	District Leadership Assembly 2026	Annual assembly for all Rotaract clubs across District 3800 featuring keynote speakers, leadership workshops, and networking.	FELLOWSHIP	SCHEDULED	2026-09-06 00:00:00+00	2026-09-06 09:00:00+00	14.5794	121.0359	Mandaluyong City Convention Center	Mandaluyong	22222222-2222-2222-2222-222222222205	0c82c113-cdb5-548f-82e0-8305b30fe505	{}	{}	300	f	t	VERIFIED_ROTARACTORS	24	https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&q=80	+63 922 690 1187	assembly@racmandaluyong.org	{}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
78d5164d-9f80-5fb6-9d46-648c7869c6f1	Bloodletting Program	Partnered with the Philippine Red Cross. Mobile donation station set up at the Valenzuela public market.	SERVICE_PROJECT	COMPLETED	2026-07-18 01:00:00+00	2026-07-18 07:00:00+00	14.7	120.9822	Valenzuela Public Market	Valenzuela	22222222-2222-2222-2222-222222222201	8ac9d561-2d0a-55be-9228-7866e89508b7	{}	{}	50	f	t	VERIFIED_ROTARACTORS	24	https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=800&q=80	+63 917 550 1120	health@racvalenzuela.org	{DISEASE_PREVENTION}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
dc933450-4842-5d19-8771-b4ed36d42167	Club Officers Planning Retreat	Internal strategy planning session for Rotaract Club of Valenzuela executive officers.	FELLOWSHIP	SCHEDULED	2026-08-30 02:00:00+00	2026-08-30 09:00:00+00	14.7	120.9822	Valenzuela Clubhouse	Valenzuela	22222222-2222-2222-2222-222222222201	8ac9d561-2d0a-55be-9228-7866e89508b7	{}	{}	20	f	f	CLUB_ONLY	12	https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80	+63 917 550 1120	board@racvalenzuela.org	{}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
4dd3a724-95ad-504e-99db-da07c976092d	Typhoon Relief Repacking	Relief packing and distribution for families displaced by flooding across Valenzuela and the CAMANAVA area.	SERVICE_PROJECT	CANCELLED	2026-08-24 01:00:00+00	2026-08-24 07:00:00+00	14.7	120.9822	Valenzuela People's Park Covered Court	Valenzuela	22222222-2222-2222-2222-222222222201	8ac9d561-2d0a-55be-9228-7866e89508b7	{}	{}	80	f	t	VERIFIED_ROTARACTORS	24	https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=800&q=80	+63 917 550 1120	relief@racvalenzuela.org	{COMMUNITY_DEVELOPMENT}	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	\N	\N	300	\N	\N	NONE	\N	\N	\N	f	0	\N	\N	t	\N
\.


--
-- Data for Name: message_deletions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.message_deletions (message_id, user_id, deleted_at) FROM stdin;
\.


--
-- Data for Name: message_reactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.message_reactions (id, message_id, user_id, emoji, created_at) FROM stdin;
\.


--
-- Data for Name: message_reads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.message_reads (conversation_id, user_id, last_read_at, last_read_message_id) FROM stdin;
6343e04d-6b0d-59ee-a11b-bf9072706575	8ac9d561-2d0a-55be-9228-7866e89508b7	2026-08-30 06:20:35.055+00	9e35d31e-39d6-57f4-8b12-2c9b17d6491b
dc938108-cd1e-5061-939b-4ec4a6e9009f	8ac9d561-2d0a-55be-9228-7866e89508b7	2026-08-30 06:20:39.524+00	70ab825b-1e99-5959-8452-2ad83bfca24f
9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	fdd68780-e899-5cdf-b28c-d5584b1bdd05	2026-08-30 10:59:14.263+00	cfe88e86-fb4a-4c5e-ae70-d1d67c2d7e7a
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, kind, title, message, event_id, application_id, conversation_id, is_read, created_at, priority, created_by) FROM stdin;
0c817b2e-2e23-5b72-bd37-c4f6b1f7e90f	f14a7e10-1e84-5adc-90ae-949fba6c64a2	INVITATION_RECEIVED	You were invited	Bianca Salazar invited you to District Leadership Assembly 2026.	843649b8-f504-5334-a2e0-e27c37609476	\N	\N	f	2026-08-08 10:00:00+00	NORMAL	\N
e7530a9b-9bdb-517f-bded-ce0bc9065d07	f14a7e10-1e84-5adc-90ae-949fba6c64a2	INVITATION_RECEIVED	You were invited	Oscar Delacruz invited you to Feeding Program — Barangay Nangka.	4bb077a7-abbd-5a6d-9b8a-9c31b7a180cd	\N	\N	f	2026-08-09 10:00:00+00	NORMAL	\N
a19f473d-8dae-5466-bbad-b0d2a978d4c3	8ac9d561-2d0a-55be-9228-7866e89508b7	INQUIRY_RECEIVED	Inquiry from Mateo Ramos	Hi President Andrea! Will there be parking near the Tullahan riverbank site?	7280b543-08eb-52a2-b912-00e67a06d6b9	\N	dc938108-cd1e-5061-939b-4ec4a6e9009f	f	2026-08-11 13:30:00+00	NORMAL	\N
35195086-5280-5b5d-9891-5881348e03e0	f14a7e10-1e84-5adc-90ae-949fba6c64a2	EVENT_UPDATE	Event Cancelled: Typhoon Relief Repacking	Reason: Postponed due to severe weather warning and localized flooding along access roads.	4dd3a724-95ad-504e-99db-da07c976092d	\N	\N	f	2026-08-12 09:00:00+00	NORMAL	\N
7302473b-febd-5b68-882b-6b5637562236	8ac9d561-2d0a-55be-9228-7866e89508b7	MEMBERSHIP_REQUEST	New membership request	Hannah Reyes applied to join Rotaract Club of Valenzuela.	\N	178e7cf9-0004-50ea-a6d6-0540e504c9ca	\N	t	2026-08-09 10:05:00+00	NORMAL	\N
ce948dcd-eb8a-5681-afc0-ce746d8077d7	8ac9d561-2d0a-55be-9228-7866e89508b7	MEMBERSHIP_REQUEST	New membership request	Diego Salvador applied to join Rotaract Club of Valenzuela.	\N	f570a24c-489f-5680-9731-359cc7417258	\N	t	2026-08-08 10:05:00+00	NORMAL	\N
a2dc8508-25ff-482f-82d8-3e392546de33	f14a7e10-1e84-5adc-90ae-949fba6c64a2	INQUIRY_RECEIVED	Patricia Gomez	Yow	\N	\N	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	f	2026-08-30 07:47:12.807+00	NORMAL	fdd68780-e899-5cdf-b28c-d5584b1bdd05
75734ef5-4ad5-451b-a52a-20d6e292bc17	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:24:26.029263+00	NORMAL	\N
99f0d690-f1e7-482b-afa9-44584e49d25a	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:24:59.232833+00	NORMAL	\N
d25a8ee9-0687-434e-a7ec-3659b11dd9c2	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:25:06.153629+00	NORMAL	\N
e1c4b19b-b86b-4e73-91e7-e9ff107b4289	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:25:19.95557+00	NORMAL	\N
0e35de69-7a68-4057-b9ac-019f7e8efee4	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:25:49.430907+00	NORMAL	\N
2d2a6c1b-19af-4cb1-92e7-0073058b9a3b	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:26:04.549789+00	NORMAL	\N
e0a6d1c7-e45b-4bcd-90db-20af96936afc	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:33:18.884517+00	NORMAL	\N
a8ffc180-5ffd-458a-9de4-0f8dad573325	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:33:33.17254+00	NORMAL	\N
b8bde8fb-7f0c-4abb-ba39-78b8134508a8	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:33:43.373764+00	NORMAL	\N
22ba121e-18a4-44bc-b361-02b1adc70850	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:34:50.742783+00	NORMAL	\N
9dd926a8-3ee9-4385-a346-d9a7a2da8029	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Hello Patricia! Test push notification from Supabase.	\N	\N	\N	f	2026-08-30 10:35:05.722136+00	NORMAL	\N
a13c3cc1-d454-4601-a766-03870e6b527e	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Testing FCM background push!	\N	\N	\N	f	2026-08-30 10:47:06.610839+00	NORMAL	\N
e9ff043c-c62c-4427-967d-47a69be1d041	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Testing FCM background push!	\N	\N	\N	f	2026-08-30 10:47:23.368644+00	NORMAL	\N
ffac7864-bd73-4642-82e1-4afff8619be8	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	New Message	Testing FCM background push!	\N	\N	\N	f	2026-08-30 10:47:55.63495+00	NORMAL	\N
ac9f7da0-0077-46a8-8b7e-78cff7e46562	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	Mateo Ramos	Hey Patricia! This is a rich messenger notification.	\N	\N	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	f	2026-08-30 10:49:20.666815+00	NORMAL	\N
5fb86c33-6091-4024-abe7-3f42af62f6e3	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	Mateo Ramos	Hey Patricia! This is a rich messenger notification.	\N	\N	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	f	2026-08-30 10:49:35.412523+00	NORMAL	\N
ca4bfdb1-af19-4287-bada-24edf819c627	fdd68780-e899-5cdf-b28c-d5584b1bdd05	INQUIRY_RECEIVED	Mateo Ramos	Hey Patricia! This is a rich messenger notification.	\N	\N	9ac2ec3f-a7c0-4f0f-bcf3-21fef5e03bf1	f	2026-08-30 10:58:58.013329+00	NORMAL	\N
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, full_name, email, username, club_id, "position", role, verification_status, avatar_url, contact_number, created_at, updated_at, allow_direct_inquiries, contact_privacy, system_role, club_role, last_latitude, last_longitude, last_location_at, signature_url, gender) FROM stdin;
f14a7e10-1e84-5adc-90ae-949fba6c64a2	Mateo Ramos	mateo@example.com	mateor	22222222-2222-2222-2222-222222222201	Member	MEMBER	VERIFIED	\N	0917 210 4488	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
bec716c6-d773-5c72-8568-934ec9566d2d	Ferdinand Ocampo	ferdinand@d3800.org	focampo	22222222-2222-2222-2222-222222222203	District Admin	DISTRICT_ADMIN	VERIFIED	\N	0918 640 7781	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
c16e6c94-67cf-5163-9fb4-7bff3056e618	Camille Bautista	camille@example.com	camilleb	22222222-2222-2222-2222-222222222201	Secretary	MEMBER	VERIFIED	\N	0915 330 9042	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
8bea3bd8-837a-5bfc-8dc9-a202e96d258e	Noel Aguilar	noel@example.com	noela	22222222-2222-2222-2222-222222222201	Treasurer	MEMBER	VERIFIED	\N	0916 471 2258	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
7ae426d1-252c-5051-9c97-b583c802d57f	Kevin Mercado	kevin@example.com	kevinm	22222222-2222-2222-2222-222222222202	Vice President	MEMBER	VERIFIED	\N	0923 405 7729	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
6112ecdc-a022-5175-a9b7-e04bb794b078	Trisha Lorenzo	trisha@example.com	trishal	22222222-2222-2222-2222-222222222203	Secretary	MEMBER	VERIFIED	\N	0924 560 8830	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
ef190a68-f479-5848-a699-81453f0f5095	Jerome Castillo	jerome@example.com	jeromec	22222222-2222-2222-2222-222222222204	Community Service Director	MEMBER	VERIFIED	\N	0925 771 9950	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
355a90fb-0403-5227-b94f-feedbdad490d	Diego Salvador	diego@example.com	diegos	22222222-2222-2222-2222-222222222201	Member	MEMBER	AWAITING_CLUB_VALIDATION	\N	0917 888 1234	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
7f7ee25c-0226-5328-a998-c5addebbe744	Hannah Reyes	hannah@example.com	hannah	22222222-2222-2222-2222-222222222201	Secretary	MEMBER	AWAITING_CLUB_VALIDATION	\N	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
63eef85d-3e17-5a85-9766-717ad7a2c543	Marco Ilagan	marco@example.com	marco	22222222-2222-2222-2222-222222222202	Member	MEMBER	VERIFIED	\N	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
5bc9cbb1-b501-5858-8663-486bcaf8a56b	Elijah Ponce	elijah@example.com	elijah	22222222-2222-2222-2222-222222222204	Vice President	MEMBER	AWAITING_ADMIN_VERIFICATION	\N	\N	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
4d2a9f31-77bc-5e08-9a13-0c6b41f2ae90	Rhea Delos Santos	rhea@d3800.org	rdelossantos	22222222-2222-2222-2222-222222222201	District Area Admin	DISTRICT_AREA_ADMIN	VERIFIED	\N	0917 555 0143	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	DISTRICT_AREA_ADMIN	MEMBER	\N	\N	\N	\N	\N
fdd68780-e899-5cdf-b28c-d5584b1bdd05	Patricia Gomez	patricia@rotaract.app	patriciag	22222222-2222-2222-2222-222222222205	App Admin	APP_ADMIN	VERIFIED	http://supabasekong-b4moya82q6ohx0yirzijfoyu.178.104.23.228.sslip.io/storage/v1/object/public/avatars/fdd68780-e899-5cdf-b28c-d5584b1bdd05/1788082140201_g4u901.jpg	0999 300 4415	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	MEMBER	\N	\N	\N	\N	\N
8ac9d561-2d0a-55be-9228-7866e89508b7	Andrea Villanueva	andrea@example.com	andreav	22222222-2222-2222-2222-222222222201	President	CLUB_PRESIDENT	VERIFIED	\N	0917 550 1120	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	CLUB_PRESIDENT	\N	\N	\N	\N	\N
8e4b923d-1889-5ab5-9180-3d098b44b0a0	Ramil Navarro	ramil@example.com	ramiln	22222222-2222-2222-2222-222222222202	President	CLUB_PRESIDENT	VERIFIED	\N	0919 802 3390	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	CLUB_PRESIDENT	\N	\N	\N	\N	\N
c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070	Denise Fuentes	denise@example.com	denisef	22222222-2222-2222-2222-222222222203	President	CLUB_PRESIDENT	VERIFIED	\N	0920 118 7764	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	CLUB_PRESIDENT	\N	\N	\N	\N	\N
74eed248-aa8d-58be-8be2-599608be879d	Oscar Delacruz	oscar@example.com	oscard	22222222-2222-2222-2222-222222222204	President	CLUB_PRESIDENT	VERIFIED	\N	0921 245 6603	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	CLUB_PRESIDENT	\N	\N	\N	\N	\N
0c82c113-cdb5-548f-82e0-8305b30fe505	Bianca Salazar	bianca@example.com	biancas	22222222-2222-2222-2222-222222222205	President	CLUB_PRESIDENT	VERIFIED	\N	0922 690 1187	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	CLUB_PRESIDENT	\N	\N	\N	\N	\N
ef6c7e59-269a-5d5c-9534-7007b3f37648	Yasmin Cortez	yasmin@example.com	yasminc	22222222-2222-2222-2222-222222222203	President	CLUB_PRESIDENT	AWAITING_DISTRICT_VALIDATION	\N	0918 999 5678	2026-08-30 06:18:29.423075+00	2026-08-30 06:18:29.423075+00	t	ALL_VERIFIED	NONE	CLUB_PRESIDENT	\N	\N	\N	\N	\N
\.


--
-- Data for Name: push_deliveries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.push_deliveries (dedupe_key, created_at) FROM stdin;
notif:80504f66-973a-4a08-a5a8-2bb4902f7e2d	2026-08-30 07:05:44.05139+00
notif:6ec64d6f-f5ab-4361-91f5-4e7398c9c291	2026-08-30 07:06:11.527644+00
notif:5d1a9479-6a9d-4db8-956a-d3a0bf480b44	2026-08-30 07:09:01.040991+00
notif:46495372-255e-4a03-aed0-d434a54ef028	2026-08-30 07:15:32.777294+00
notif:404fccb9-d67f-454e-b531-a2755501f2f5	2026-08-30 07:15:37.840693+00
notif:78331550-8c8f-4552-b3c7-4786436476c7	2026-08-30 07:16:21.166255+00
notif:e10fb29b-9821-40e0-ba61-6f8639088da5	2026-08-30 07:16:21.166128+00
notif:b0014868-2697-4bfb-aaca-c419dca70376	2026-08-30 07:16:50.314502+00
notif:82e36a2c-3b8f-4092-ab0c-f9e52a066ef7	2026-08-30 07:16:50.331107+00
notif:e425f320-e8c3-4e3d-a4b4-fd850e0b086c	2026-08-30 07:17:03.478277+00
notif:c71b077a-f73f-4ce5-b400-8ce30525a19f	2026-08-30 07:17:03.481122+00
notif:0e8a435e-0df5-4cb0-8409-6d223f5df8ed	2026-08-30 07:17:28.595911+00
notif:213c5b6d-d012-4d34-85eb-018bd10d2397	2026-08-30 07:17:28.603603+00
notif:4f3c492e-dd13-4827-88e2-b43101ef313b	2026-08-30 07:27:24.110815+00
notif:6e892762-7dcf-4ca4-a37a-bda9942218f7	2026-08-30 07:28:29.570305+00
notif:8604e0d8-d733-4634-b4d1-3b7ac06fa3ed	2026-08-30 07:34:15.392108+00
notif:ee1c65b3-ea94-4a3a-88f9-a20224466503	2026-08-30 07:36:41.356844+00
notif:54de0d4c-196b-4757-ace3-8d5934511cb0	2026-08-30 07:46:43.45377+00
notif:a2dc8508-25ff-482f-82d8-3e392546de33	2026-08-30 07:47:13.132881+00
notif:75734ef5-4ad5-451b-a52a-20d6e292bc17	2026-08-30 10:24:26.62565+00
notif:99f0d690-f1e7-482b-afa9-44584e49d25a	2026-08-30 10:24:59.837212+00
notif:d25a8ee9-0687-434e-a7ec-3659b11dd9c2	2026-08-30 10:25:06.872871+00
notif:e1c4b19b-b86b-4e73-91e7-e9ff107b4289	2026-08-30 10:25:21.954335+00
notif:0e35de69-7a68-4057-b9ac-019f7e8efee4	2026-08-30 10:25:51.094746+00
notif:2d2a6c1b-19af-4cb1-92e7-0073058b9a3b	2026-08-30 10:26:06.15752+00
notif:e0a6d1c7-e45b-4bcd-90db-20af96936afc	2026-08-30 10:33:19.941204+00
notif:a8ffc180-5ffd-458a-9de4-0f8dad573325	2026-08-30 10:33:33.324387+00
notif:b8bde8fb-7f0c-4abb-ba39-78b8134508a8	2026-08-30 10:33:44.43239+00
notif:22ba121e-18a4-44bc-b361-02b1adc70850	2026-08-30 10:34:51.837978+00
notif:9dd926a8-3ee9-4385-a346-d9a7a2da8029	2026-08-30 10:35:06.916273+00
notif:a13c3cc1-d454-4601-a766-03870e6b527e	2026-08-30 10:47:07.285202+00
notif:e9ff043c-c62c-4427-967d-47a69be1d041	2026-08-30 10:47:24.654535+00
notif:ffac7864-bd73-4642-82e1-4afff8619be8	2026-08-30 10:47:56.047029+00
notif:ac9f7da0-0077-46a8-8b7e-78cff7e46562	2026-08-30 10:49:21.60495+00
notif:5fb86c33-6091-4024-abe7-3f42af62f6e3	2026-08-30 10:49:36.865258+00
notif:ca4bfdb1-af19-4287-bada-24edf819c627	2026-08-30 10:58:58.836244+00
\.


--
-- Data for Name: push_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.push_tokens (token, user_id, platform, updated_at, device_token) FROM stdin;
ExponentPushToken[fyyo73E5djm4fNUif5q71j]	fdd68780-e899-5cdf-b28c-d5584b1bdd05	android	2026-08-30 10:59:14.597+00	f_6dH3VJSjuc0vOxgIcbJz:APA91bGlaImCKJ-f6Zbs-zWOypYdLdY8WhXxiC6o8UtqEePWf6ddBB_dOs9AgCPKgKTOHtgaztXWbvvOB0HLzbCL624Cx0rRlVI6OOKndvnosS2OnhM8AM8
\.


--
-- Data for Name: verification_applications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.verification_applications (id, user_id, full_name, email, club_id, member_id, "position", status, proof_url, submitted_at, notes) FROM stdin;
f570a24c-489f-5680-9731-359cc7417258	355a90fb-0403-5227-b94f-feedbdad490d	Diego Salvador	diego@example.com	22222222-2222-2222-2222-222222222201	10482931	Member	AWAITING_CLUB_VALIDATION	\N	2026-08-08 10:00:00+00	
178e7cf9-0004-50ea-a6d6-0540e504c9ca	7f7ee25c-0226-5328-a998-c5addebbe744	Hannah Reyes	hannah@example.com	22222222-2222-2222-2222-222222222201	10482932	Secretary	AWAITING_CLUB_VALIDATION	\N	2026-08-09 10:00:00+00	
46ca3053-cdf5-58dc-afdf-3e10c7192cb6	63eef85d-3e17-5a85-9766-717ad7a2c543	Marco Ilagan	marco@example.com	22222222-2222-2222-2222-222222222202	10482933	Member	VERIFIED	\N	2026-08-05 10:00:00+00	Verified member per club roster.
6cb38cea-f9e5-578e-adba-1432243a2b5a	ef6c7e59-269a-5d5c-9534-7007b3f37648	Yasmin Cortez	yasmin@example.com	22222222-2222-2222-2222-222222222203	10482934	President	AWAITING_DISTRICT_VALIDATION	\N	2026-08-06 10:00:00+00	Recently elected president of new charter club.
2cd20bfd-9067-56fe-942d-1eb18c2d3c26	5bc9cbb1-b501-5858-8663-486bcaf8a56b	Elijah Ponce	elijah@example.com	22222222-2222-2222-2222-222222222204	10482935	Vice President	AWAITING_ADMIN_VERIFICATION	\N	2026-08-04 10:00:00+00	
\.


--
-- Data for Name: zones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.zones (id, zone_number, zone_name, created_at) FROM stdin;
11111111-1111-1111-1111-111111111101	1	Zone 1	2026-08-30 06:18:29.423075+00
11111111-1111-1111-1111-111111111102	2	Zone 2	2026-08-30 06:18:29.423075+00
11111111-1111-1111-1111-111111111103	3	Zone 3	2026-08-30 06:18:29.423075+00
11111111-1111-1111-1111-111111111104	4	Zone 4	2026-08-30 06:18:29.423075+00
11111111-1111-1111-1111-111111111105	5	Zone 5	2026-08-30 06:18:29.423075+00
11111111-1111-1111-1111-111111111106	6	Zone 6	2026-08-30 06:18:29.423075+00
11111111-1111-1111-1111-111111111107	7	Zone 7	2026-08-30 06:18:29.423075+00
11111111-1111-1111-1111-111111111108	8	Zone 8	2026-08-30 06:18:29.423075+00
\.


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_club_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_club_code_key UNIQUE (club_code);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: conversation_states conversation_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_pkey PRIMARY KEY (conversation_id, user_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: direct_messages direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);


--
-- Name: event_club_allocations event_club_allocations_event_id_club_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_club_allocations
    ADD CONSTRAINT event_club_allocations_event_id_club_id_key UNIQUE (event_id, club_id);


--
-- Name: event_club_allocations event_club_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_club_allocations
    ADD CONSTRAINT event_club_allocations_pkey PRIMARY KEY (id);


--
-- Name: event_cohosts event_cohosts_event_id_club_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_event_id_club_id_key UNIQUE (event_id, club_id);


--
-- Name: event_cohosts event_cohosts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_pkey PRIMARY KEY (id);


--
-- Name: event_impacts event_impacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_impacts
    ADD CONSTRAINT event_impacts_pkey PRIMARY KEY (event_id);


--
-- Name: event_invitations event_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT event_invitations_pkey PRIMARY KEY (id);


--
-- Name: event_participants event_participants_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: event_participants event_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_pkey PRIMARY KEY (id);


--
-- Name: event_participating_clubs event_participating_clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participating_clubs
    ADD CONSTRAINT event_participating_clubs_pkey PRIMARY KEY (event_id, club_id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: message_deletions message_deletions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_deletions
    ADD CONSTRAINT message_deletions_pkey PRIMARY KEY (message_id, user_id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: message_reads message_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_pkey PRIMARY KEY (conversation_id, user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: push_deliveries push_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_deliveries
    ADD CONSTRAINT push_deliveries_pkey PRIMARY KEY (dedupe_key);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (token);


--
-- Name: message_reactions uq_message_user_reaction; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT uq_message_user_reaction UNIQUE (message_id, user_id);


--
-- Name: verification_applications verification_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_applications
    ADD CONSTRAINT verification_applications_pkey PRIMARY KEY (id);


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Name: zones zones_zone_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_zone_number_key UNIQUE (zone_number);


--
-- Name: idx_audit_logs_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_application_id ON public.audit_logs USING btree (application_id);


--
-- Name: idx_audit_logs_category_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_category_created_at ON public.audit_logs USING btree (category, created_at DESC);


--
-- Name: idx_audit_logs_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_event_id ON public.audit_logs USING btree (event_id);


--
-- Name: idx_audit_logs_target_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_target_user_id ON public.audit_logs USING btree (target_user_id);


--
-- Name: idx_clubs_president_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clubs_president_id ON public.clubs USING btree (president_id);


--
-- Name: idx_clubs_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clubs_zone_id ON public.clubs USING btree (zone_id);


--
-- Name: idx_conversation_states_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_states_user ON public.conversation_states USING btree (user_id);


--
-- Name: idx_conversations_organizer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_organizer_user_id ON public.conversations USING btree (organizer_user_id);


--
-- Name: idx_conversations_users; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_users ON public.conversations USING btree (participant_user_id, organizer_user_id);


--
-- Name: idx_direct_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_conversation ON public.direct_messages USING btree (conversation_id, created_at);


--
-- Name: idx_direct_messages_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_event_id ON public.direct_messages USING btree (event_id);


--
-- Name: idx_direct_messages_mentions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_mentions ON public.direct_messages USING gin (mentioned_user_ids);


--
-- Name: idx_direct_messages_receiver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_receiver_id ON public.direct_messages USING btree (receiver_id);


--
-- Name: idx_direct_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_sender_id ON public.direct_messages USING btree (sender_id);


--
-- Name: idx_event_club_allocations_club_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_club_allocations_club_id ON public.event_club_allocations USING btree (club_id);


--
-- Name: idx_event_club_allocations_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_club_allocations_event ON public.event_club_allocations USING btree (event_id);


--
-- Name: idx_event_cohosts_club; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cohosts_club ON public.event_cohosts USING btree (club_id);


--
-- Name: idx_event_cohosts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cohosts_event ON public.event_cohosts USING btree (event_id);


--
-- Name: idx_event_cohosts_payment_verified_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cohosts_payment_verified_by ON public.event_cohosts USING btree (payment_verified_by_user_id);


--
-- Name: idx_event_cohosts_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cohosts_requested_by ON public.event_cohosts USING btree (requested_by_user_id);


--
-- Name: idx_event_cohosts_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_cohosts_reviewed_by ON public.event_cohosts USING btree (reviewed_by_user_id);


--
-- Name: idx_event_invitations_invited_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_invitations_invited_by ON public.event_invitations USING btree (invited_by_user_id);


--
-- Name: idx_event_invitations_invited_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_invitations_invited_user ON public.event_invitations USING btree (invited_user_id);


--
-- Name: idx_event_participating_clubs_club_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_participating_clubs_club_id ON public.event_participating_clubs USING btree (club_id);


--
-- Name: idx_events_district_review_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_district_review_requested ON public.events USING btree (district_review_requested_at DESC) WHERE (district_review_requested_at IS NOT NULL);


--
-- Name: idx_events_district_review_requested_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_district_review_requested_by ON public.events USING btree (district_review_requested_by);


--
-- Name: idx_events_organizer_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_organizer_user_id ON public.events USING btree (organizer_user_id);


--
-- Name: idx_events_organizing_club; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_organizing_club ON public.events USING btree (organizing_club_id);


--
-- Name: idx_events_start_datetime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_start_datetime ON public.events USING btree (start_datetime);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_message_deletions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_deletions_user ON public.message_deletions USING btree (user_id);


--
-- Name: idx_message_reactions_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_message_id ON public.message_reactions USING btree (message_id);


--
-- Name: idx_message_reactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_user_id ON public.message_reactions USING btree (user_id);


--
-- Name: idx_message_reads_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reads_conversation ON public.message_reads USING btree (conversation_id);


--
-- Name: idx_message_reads_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reads_user_id ON public.message_reads USING btree (user_id);


--
-- Name: idx_notifications_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_application_id ON public.notifications USING btree (application_id);


--
-- Name: idx_notifications_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_conversation_id ON public.notifications USING btree (conversation_id);


--
-- Name: idx_notifications_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_by ON public.notifications USING btree (created_by, created_at);


--
-- Name: idx_notifications_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_event_id ON public.notifications USING btree (event_id);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_participants_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_event ON public.event_participants USING btree (event_id);


--
-- Name: idx_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participants_user ON public.event_participants USING btree (user_id);


--
-- Name: idx_profiles_club_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_club_id ON public.profiles USING btree (club_id);


--
-- Name: idx_push_deliveries_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_deliveries_created ON public.push_deliveries USING btree (created_at);


--
-- Name: idx_push_tokens_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_tokens_device ON public.push_tokens USING btree (device_token);


--
-- Name: idx_push_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_tokens_user ON public.push_tokens USING btree (user_id);


--
-- Name: idx_verification_applications_club_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_applications_club_id ON public.verification_applications USING btree (club_id);


--
-- Name: idx_verification_applications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_applications_user_id ON public.verification_applications USING btree (user_id);


--
-- Name: uniq_group_conversation_per_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_group_conversation_per_event ON public.conversations USING btree (event_id) WHERE is_group;


--
-- Name: uniq_pending_invitation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_pending_invitation ON public.event_invitations USING btree (event_id, invited_user_id) WHERE (status = 'PENDING'::public.invitation_status);


--
-- Name: direct_messages send-push-direct-messages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "send-push-direct-messages" AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://supabasekong-b4moya82q6ohx0yirzijfoyu.178.104.23.228.sslip.io/functions/v1/send-push', 'POST', '{"Content-type":"application/json","x-webhook-secret":"rotaract_whsec_98f4a72d1b8c6e3a"}', '{}', '5000');


--
-- Name: notifications send-push-notifications; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "send-push-notifications" AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://supabasekong-b4moya82q6ohx0yirzijfoyu.178.104.23.228.sslip.io/functions/v1/send-push', 'POST', '{"Content-type":"application/json","x-webhook-secret":"rotaract_whsec_98f4a72d1b8c6e3a"}', '{}', '5000');


--
-- Name: message_reactions send-push-reactions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "send-push-reactions" AFTER INSERT ON public.message_reactions FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://supabasekong-b4moya82q6ohx0yirzijfoyu.178.104.23.228.sslip.io/functions/v1/send-push', 'POST', '{"Content-type":"application/json","x-webhook-secret":"rotaract_whsec_98f4a72d1b8c6e3a"}', '{}', '5000');


--
-- Name: direct_messages tr_send_push_direct_messages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_send_push_direct_messages AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.dispatch_send_push_webhook();


--
-- Name: message_reactions tr_send_push_message_reactions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_send_push_message_reactions AFTER INSERT ON public.message_reactions FOR EACH ROW EXECUTE FUNCTION public.dispatch_send_push_webhook();


--
-- Name: notifications tr_send_push_notifications; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_send_push_notifications AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.dispatch_send_push_webhook();


--
-- Name: event_participants trg_enforce_club_allocation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_club_allocation BEFORE INSERT OR UPDATE ON public.event_participants FOR EACH ROW EXECUTE FUNCTION public.enforce_club_allocation();


--
-- Name: event_invitations trg_guard_invitation_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_invitation_update BEFORE UPDATE ON public.event_invitations FOR EACH ROW EXECUTE FUNCTION public.guard_invitation_update();


--
-- Name: verification_applications trg_guard_verification_application_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_verification_application_update BEFORE UPDATE ON public.verification_applications FOR EACH ROW EXECUTE FUNCTION public.guard_verification_application_update();


--
-- Name: notifications trg_notification_rate_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_rate_limit BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_rate_limit();


--
-- Name: event_club_allocations trg_touch_event_club_allocation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_event_club_allocation BEFORE UPDATE ON public.event_club_allocations FOR EACH ROW EXECUTE FUNCTION public.touch_event_club_allocation();


--
-- Name: event_cohosts trg_touch_event_cohost; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_event_cohost BEFORE UPDATE ON public.event_cohosts FOR EACH ROW EXECUTE FUNCTION public.touch_event_cohost();


--
-- Name: audit_logs audit_logs_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.verification_applications(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: clubs clubs_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.zones(id) ON DELETE SET NULL;


--
-- Name: conversation_states conversation_states_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_states conversation_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_organizer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_organizer_user_id_fkey FOREIGN KEY (organizer_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_participant_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_participant_user_id_fkey FOREIGN KEY (participant_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: direct_messages direct_messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_club_allocations event_club_allocations_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_club_allocations
    ADD CONSTRAINT event_club_allocations_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: event_club_allocations event_club_allocations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_club_allocations
    ADD CONSTRAINT event_club_allocations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_cohosts event_cohosts_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: event_cohosts event_cohosts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_cohosts event_cohosts_payment_verified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_payment_verified_by_user_id_fkey FOREIGN KEY (payment_verified_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_cohosts event_cohosts_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_cohosts event_cohosts_reviewed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_cohosts
    ADD CONSTRAINT event_cohosts_reviewed_by_user_id_fkey FOREIGN KEY (reviewed_by_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: event_impacts event_impacts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_impacts
    ADD CONSTRAINT event_impacts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invitations event_invitations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT event_invitations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_invitations event_invitations_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT event_invitations_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_invitations event_invitations_invited_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invitations
    ADD CONSTRAINT event_invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_participants event_participants_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_participants event_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_participating_clubs event_participating_clubs_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participating_clubs
    ADD CONSTRAINT event_participating_clubs_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: event_participating_clubs event_participating_clubs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participating_clubs
    ADD CONSTRAINT event_participating_clubs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: events events_district_review_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_district_review_requested_by_fkey FOREIGN KEY (district_review_requested_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: events events_organizer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organizer_user_id_fkey FOREIGN KEY (organizer_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: events events_organizing_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organizing_club_id_fkey FOREIGN KEY (organizing_club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: clubs fk_clubs_president; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT fk_clubs_president FOREIGN KEY (president_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications fk_notif_conversation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_notif_conversation FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: message_deletions message_deletions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_deletions
    ADD CONSTRAINT message_deletions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.direct_messages(id) ON DELETE CASCADE;


--
-- Name: message_deletions message_deletions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_deletions
    ADD CONSTRAINT message_deletions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.direct_messages(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: message_reads message_reads_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: message_reads message_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reads
    ADD CONSTRAINT message_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.verification_applications(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: verification_applications verification_applications_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_applications
    ADD CONSTRAINT verification_applications_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;


--
-- Name: verification_applications verification_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_applications
    ADD CONSTRAINT verification_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: push_deliveries Admins can view push deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view push deliveries" ON public.push_deliveries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.system_role = ANY (ARRAY['APP_ADMIN'::text, 'DISTRICT_ADMIN'::text])) OR (profiles.role = ANY (ARRAY['APP_ADMIN'::public.user_role, 'DISTRICT_ADMIN'::public.user_role])))))));


--
-- Name: event_club_allocations Allocations deletable by organizers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allocations deletable by organizers" ON public.event_club_allocations FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_club_allocations.event_id) AND ((( SELECT auth.uid() AS uid) = e.organizer_user_id) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids)) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role]))))))))));


--
-- Name: event_club_allocations Allocations insertable by organizers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allocations insertable by organizers" ON public.event_club_allocations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_club_allocations.event_id) AND ((( SELECT auth.uid() AS uid) = e.organizer_user_id) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids)) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role]))))))))));


--
-- Name: event_club_allocations Allocations readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allocations readable by authenticated" ON public.event_club_allocations FOR SELECT TO authenticated USING (true);


--
-- Name: event_club_allocations Allocations updatable by organizers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allocations updatable by organizers" ON public.event_club_allocations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_club_allocations.event_id) AND ((( SELECT auth.uid() AS uid) = e.organizer_user_id) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids)) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role])))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_club_allocations.event_id) AND ((( SELECT auth.uid() AS uid) = e.organizer_user_id) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids)) OR (EXISTS ( SELECT 1
           FROM public.profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role]))))))))));


--
-- Name: verification_applications Applications insertable by applicant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applications insertable by applicant" ON public.verification_applications FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: verification_applications Applications updatable by reviewers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applications updatable by reviewers" ON public.verification_applications FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.system_role = ANY (ARRAY['APP_ADMIN'::text, 'DISTRICT_ADMIN'::text, 'DISTRICT_AREA_ADMIN'::text])) OR (p.club_role = 'PRESIDENT'::text)))))));


--
-- Name: verification_applications Applications viewable by relevant users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Applications viewable by relevant users" ON public.verification_applications FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.system_role = ANY (ARRAY['APP_ADMIN'::text, 'DISTRICT_ADMIN'::text, 'DISTRICT_AREA_ADMIN'::text])) OR (p.club_role = 'PRESIDENT'::text)))))));


--
-- Name: audit_logs Audit logs insertable by reviewers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit logs insertable by reviewers" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.system_role = ANY (ARRAY['APP_ADMIN'::text, 'DISTRICT_ADMIN'::text, 'DISTRICT_AREA_ADMIN'::text])) OR (p.club_role = 'PRESIDENT'::text))))));


--
-- Name: audit_logs Audit logs viewable by admins and club presidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit logs viewable by admins and club presidents" ON public.audit_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.system_role = ANY (ARRAY['APP_ADMIN'::text, 'DISTRICT_ADMIN'::text, 'DISTRICT_AREA_ADMIN'::text])) OR (p.club_role = 'PRESIDENT'::text))))));


--
-- Name: clubs Clubs are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clubs are viewable by everyone" ON public.clubs FOR SELECT USING (true);


--
-- Name: clubs Clubs insertable by district and app admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clubs insertable by district and app admins" ON public.clubs FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.system_role = ANY (ARRAY['APP_ADMIN'::text, 'DISTRICT_ADMIN'::text, 'DISTRICT_AREA_ADMIN'::text]))))));


--
-- Name: event_cohosts Cohosts deletable via RPC only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cohosts deletable via RPC only" ON public.event_cohosts FOR DELETE TO authenticated USING (false);


--
-- Name: event_cohosts Cohosts insertable via RPC only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cohosts insertable via RPC only" ON public.event_cohosts FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: event_cohosts Cohosts readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cohosts readable by authenticated" ON public.event_cohosts FOR SELECT TO authenticated USING (true);


--
-- Name: event_cohosts Cohosts updatable via RPC only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cohosts updatable via RPC only" ON public.event_cohosts FOR UPDATE TO authenticated USING (false) WITH CHECK (false);


--
-- Name: conversations Conversations insertable by participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Conversations insertable by participants" ON public.conversations FOR INSERT TO authenticated WITH CHECK ((((NOT is_group) AND ((participant_user_id = ( SELECT auth.uid() AS uid)) OR (organizer_user_id = ( SELECT auth.uid() AS uid)))) OR (is_group AND (organizer_user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: conversations Conversations updatable by participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Conversations updatable by participants" ON public.conversations FOR UPDATE TO authenticated USING (((participant_user_id = ( SELECT auth.uid() AS uid)) OR (organizer_user_id = ( SELECT auth.uid() AS uid)) OR (is_group AND (EXISTS ( SELECT 1
   FROM public.event_participants ep
  WHERE ((ep.event_id = conversations.event_id) AND (ep.user_id = ( SELECT auth.uid() AS uid)) AND (ep.status = 'JOINED'::public.participation_status)))))));


--
-- Name: conversations Conversations viewable by participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Conversations viewable by participants" ON public.conversations FOR SELECT TO authenticated USING (((participant_user_id = ( SELECT auth.uid() AS uid)) OR (organizer_user_id = ( SELECT auth.uid() AS uid)) OR (is_group AND (EXISTS ( SELECT 1
   FROM public.event_participants ep
  WHERE ((ep.event_id = conversations.event_id) AND (ep.user_id = ( SELECT auth.uid() AS uid)) AND (ep.status = 'JOINED'::public.participation_status)))))));


--
-- Name: events Events insertable by members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Events insertable by members" ON public.events FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = organizer_user_id));


--
-- Name: events Events updatable by organizers or presidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Events updatable by organizers or presidents" ON public.events FOR UPDATE TO authenticated USING (((status <> ALL (ARRAY['COMPLETED'::public.event_status, 'CANCELLED'::public.event_status])) AND ((( SELECT auth.uid() AS uid) = organizer_user_id) OR (( SELECT auth.uid() AS uid) = ANY (co_organizer_user_ids)) OR public.governs_club(( SELECT auth.uid() AS uid), organizing_club_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role])))))))) WITH CHECK (((( SELECT auth.uid() AS uid) = organizer_user_id) OR (( SELECT auth.uid() AS uid) = ANY (co_organizer_user_ids)) OR public.governs_club(( SELECT auth.uid() AS uid), organizing_club_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role])))))));


--
-- Name: events Events viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Events viewable by authenticated users" ON public.events FOR SELECT TO authenticated USING (((status <> ALL (ARRAY['PENDING_APPROVAL'::public.event_status, 'DRAFT'::public.event_status])) OR (( SELECT auth.uid() AS uid) = organizer_user_id) OR (( SELECT auth.uid() AS uid) = ANY (co_organizer_user_ids)) OR public.governs_club(( SELECT auth.uid() AS uid), organizing_club_id) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role])))))));


--
-- Name: event_impacts Impacts insertable by organizing team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Impacts insertable by organizing team" ON public.event_impacts FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_impacts.event_id) AND ((e.organizer_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids)))))));


--
-- Name: event_impacts Impacts updatable by organizing team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Impacts updatable by organizing team" ON public.event_impacts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_impacts.event_id) AND ((e.organizer_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids)))))));


--
-- Name: event_impacts Impacts viewable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Impacts viewable by authenticated" ON public.event_impacts FOR SELECT TO authenticated USING (true);


--
-- Name: event_invitations Invitations insertable by inviters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Invitations insertable by inviters" ON public.event_invitations FOR INSERT TO authenticated WITH CHECK ((invited_by_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: event_invitations Invitations updatable by invitee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Invitations updatable by invitee" ON public.event_invitations FOR UPDATE TO authenticated USING ((invited_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: event_invitations Invitations viewable by participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Invitations viewable by participants" ON public.event_invitations FOR SELECT TO authenticated USING (((invited_user_id = ( SELECT auth.uid() AS uid)) OR (invited_by_user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: direct_messages Messages insertable respecting inquiry setting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Messages insertable respecting inquiry setting" ON public.direct_messages FOR INSERT TO authenticated WITH CHECK ((sender_id = ( SELECT auth.uid() AS uid)));


--
-- Name: direct_messages Messages viewable by conversation participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Messages viewable by conversation participants" ON public.direct_messages FOR SELECT TO authenticated USING (((sender_id = ( SELECT auth.uid() AS uid)) OR (receiver_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = direct_messages.conversation_id) AND ((c.organizer_user_id = ( SELECT auth.uid() AS uid)) OR (c.participant_user_id = ( SELECT auth.uid() AS uid)) OR (c.is_group AND (EXISTS ( SELECT 1
           FROM public.event_participants ep
          WHERE ((ep.event_id = c.event_id) AND (ep.user_id = ( SELECT auth.uid() AS uid)) AND (ep.status = 'JOINED'::public.participation_status)))))))))));


--
-- Name: notifications Notifications deletable by recipient; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Notifications deletable by recipient" ON public.notifications FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications Notifications insertable with attributable creator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Notifications insertable with attributable creator" ON public.notifications FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR (created_by IS NULL)));


--
-- Name: notifications Notifications updatable by recipient; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Notifications updatable by recipient" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications Notifications viewable by recipient; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Notifications viewable by recipient" ON public.notifications FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: conversation_states Own conversation state is visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Own conversation state is visible" ON public.conversation_states FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: message_deletions Own message deletions are visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Own message deletions are visible" ON public.message_deletions FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: push_tokens Own push tokens are visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Own push tokens are visible" ON public.push_tokens FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: event_participants Participants deletable by self or organizing team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants deletable by self or organizing team" ON public.event_participants FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_participants.event_id) AND ((e.organizer_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids))))))));


--
-- Name: event_participants Participants insertable by self or organizing team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants insertable by self or organizing team" ON public.event_participants FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_participants.event_id) AND ((e.organizer_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids))))))));


--
-- Name: event_participants Participants updatable by self or organizing team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants updatable by self or organizing team" ON public.event_participants FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_participants.event_id) AND ((e.organizer_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (e.co_organizer_user_ids)))))) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.system_role = ANY (ARRAY['APP_ADMIN'::text, 'DISTRICT_ADMIN'::text])) OR (p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role])))))) OR (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.events e ON ((e.id = event_participants.event_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'CLUB_PRESIDENT'::public.user_role) AND (p.club_id = e.organizing_club_id)))) OR (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.event_participating_clubs epc ON ((epc.event_id = event_participants.event_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'CLUB_PRESIDENT'::public.user_role) AND (p.club_id = epc.club_id))))));


--
-- Name: event_participants Participants viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants viewable by authenticated users" ON public.event_participants FOR SELECT TO authenticated USING (true);


--
-- Name: event_participating_clubs Participating clubs deletable by organizer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participating clubs deletable by organizer" ON public.event_participating_clubs FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_participating_clubs.event_id) AND (e.organizer_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: event_participating_clubs Participating clubs insertable by organizer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participating clubs insertable by organizer" ON public.event_participating_clubs FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_participating_clubs.event_id) AND (e.organizer_user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: event_participating_clubs Participating clubs viewable by all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participating clubs viewable by all" ON public.event_participating_clubs FOR SELECT TO authenticated USING (true);


--
-- Name: profiles Profiles are viewable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: message_reactions Reactions are viewable by everyone who can view the message; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reactions are viewable by everyone who can view the message" ON public.message_reactions FOR SELECT TO authenticated USING (true);


--
-- Name: message_reads Read cursors visible to conversation members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read cursors visible to conversation members" ON public.message_reads FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id));


--
-- Name: message_reactions Users can delete their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own reactions" ON public.message_reactions FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: message_reactions Users can insert their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own reactions" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: message_deletions Users can undo their own hide; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can undo their own hide" ON public.message_deletions FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: message_reactions Users can update their own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own reactions" ON public.message_reactions FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: conversation_states Users clear their own conversation state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users clear their own conversation state" ON public.conversation_states FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: message_deletions Users hide messages for themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users hide messages for themselves" ON public.message_deletions FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: push_tokens Users register their own push token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users register their own push token" ON public.push_tokens FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: push_tokens Users remove their own push token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users remove their own push token" ON public.push_tokens FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: conversation_states Users set their own conversation state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users set their own conversation state" ON public.conversation_states FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: conversation_states Users update their own conversation state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their own conversation state" ON public.conversation_states FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: push_tokens Users update their own push token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their own push token" ON public.push_tokens FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: message_reads Users update their own read cursor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their own read cursor" ON public.message_reads FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: message_reads Users upsert their own read cursor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users upsert their own read cursor" ON public.message_reads FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: zones Zones are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Zones are viewable by everyone" ON public.zones FOR SELECT USING (true);


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: clubs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: direct_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: event_club_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_club_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_cohosts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_cohosts ENABLE ROW LEVEL SECURITY;

--
-- Name: event_impacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_impacts ENABLE ROW LEVEL SECURITY;

--
-- Name: event_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: event_participating_clubs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_participating_clubs ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: message_deletions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



-- ========================================================
-- SEED DATA
-- ========================================================
-- ========================================================
-- ROTARACT CONNECT — SEED DATA (generated from src/data/mockData.ts)
-- Run AFTER the migrations (supabase db reset runs this automatically).
-- Idempotent (ON CONFLICT DO NOTHING).
-- Every seeded account signs in with password: Password123!
-- ========================================================
create extension if not exists pgcrypto with schema extensions;

-- Zones
INSERT INTO zones (id, zone_number, zone_name) VALUES ('11111111-1111-1111-1111-111111111101', 1, 'Zone 1') ON CONFLICT (id) DO NOTHING;
INSERT INTO zones (id, zone_number, zone_name) VALUES ('11111111-1111-1111-1111-111111111102', 2, 'Zone 2') ON CONFLICT (id) DO NOTHING;
INSERT INTO zones (id, zone_number, zone_name) VALUES ('11111111-1111-1111-1111-111111111103', 3, 'Zone 3') ON CONFLICT (id) DO NOTHING;
INSERT INTO zones (id, zone_number, zone_name) VALUES ('11111111-1111-1111-1111-111111111104', 4, 'Zone 4') ON CONFLICT (id) DO NOTHING;
INSERT INTO zones (id, zone_number, zone_name) VALUES ('11111111-1111-1111-1111-111111111105', 5, 'Zone 5') ON CONFLICT (id) DO NOTHING;
INSERT INTO zones (id, zone_number, zone_name) VALUES ('11111111-1111-1111-1111-111111111106', 6, 'Zone 6') ON CONFLICT (id) DO NOTHING;
INSERT INTO zones (id, zone_number, zone_name) VALUES ('11111111-1111-1111-1111-111111111107', 7, 'Zone 7') ON CONFLICT (id) DO NOTHING;
INSERT INTO zones (id, zone_number, zone_name) VALUES ('11111111-1111-1111-1111-111111111108', 8, 'Zone 8') ON CONFLICT (id) DO NOTHING;

-- Clubs (president_id set later to resolve the clubs<->profiles cycle)
INSERT INTO clubs (id, club_name, club_code, zone_id, city, province, latitude, longitude, description, member_count) VALUES ('22222222-2222-2222-2222-222222222201', 'Rotaract Club of Valenzuela', 'RC-3800-021', '11111111-1111-1111-1111-111111111103', 'Valenzuela', 'Metro Manila', 14.7, 120.9822, 'Youth service and leadership across Valenzuela City since 2011.', 48) ON CONFLICT (id) DO NOTHING;
INSERT INTO clubs (id, club_name, club_code, zone_id, city, province, latitude, longitude, description, member_count) VALUES ('22222222-2222-2222-2222-222222222202', 'Rotaract Club of Malabon', 'RC-3800-022', '11111111-1111-1111-1111-111111111101', 'Malabon', 'Metro Manila', 14.657, 120.9569, 'Serving the historic riverside communities of Malabon.', 33) ON CONFLICT (id) DO NOTHING;
INSERT INTO clubs (id, club_name, club_code, zone_id, city, province, latitude, longitude, description, member_count) VALUES ('22222222-2222-2222-2222-222222222203', 'Rotaract Club of Caloocan', 'RC-3800-023', '11111111-1111-1111-1111-111111111102', 'Caloocan', 'Metro Manila', 14.6499, 120.967, 'Driving community and environmental projects across Caloocan.', 41) ON CONFLICT (id) DO NOTHING;
INSERT INTO clubs (id, club_name, club_code, zone_id, city, province, latitude, longitude, description, member_count) VALUES ('22222222-2222-2222-2222-222222222204', 'Rotaract Club of Marikina', 'RC-3800-024', '11111111-1111-1111-1111-111111111104', 'Marikina', 'Metro Manila', 14.6507, 121.1029, 'Building compassionate young leaders in the Shoe Capital.', 52) ON CONFLICT (id) DO NOTHING;
INSERT INTO clubs (id, club_name, club_code, zone_id, city, province, latitude, longitude, description, member_count) VALUES ('22222222-2222-2222-2222-222222222205', 'Rotaract Club of Mandaluyong', 'RC-3800-025', '11111111-1111-1111-1111-111111111108', 'Mandaluyong', 'Metro Manila', 14.5794, 121.0359, 'A growing family of young professionals serving Mandaluyong.', 37) ON CONFLICT (id) DO NOTHING;

-- Auth users (email/password) + identities
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'authenticated', 'authenticated', 'mateo@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Mateo Ramos"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'authenticated', 'authenticated', 'andrea@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Andrea Villanueva"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', 'bec716c6-d773-5c72-8568-934ec9566d2d', 'authenticated', 'authenticated', 'ferdinand@d3800.org', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ferdinand Ocampo"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', 'fdd68780-e899-5cdf-b28c-d5584b1bdd05', 'authenticated', 'authenticated', 'patricia@rotaract.app', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Patricia Gomez"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', 'c16e6c94-67cf-5163-9fb4-7bff3056e618', 'authenticated', 'authenticated', 'camille@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Camille Bautista"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '8bea3bd8-837a-5bfc-8dc9-a202e96d258e', 'authenticated', 'authenticated', 'noel@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Noel Aguilar"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '8e4b923d-1889-5ab5-9180-3d098b44b0a0', 'authenticated', 'authenticated', 'ramil@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ramil Navarro"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', 'c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070', 'authenticated', 'authenticated', 'denise@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Denise Fuentes"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '74eed248-aa8d-58be-8be2-599608be879d', 'authenticated', 'authenticated', 'oscar@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Oscar Delacruz"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '0c82c113-cdb5-548f-82e0-8305b30fe505', 'authenticated', 'authenticated', 'bianca@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bianca Salazar"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '7ae426d1-252c-5051-9c97-b583c802d57f', 'authenticated', 'authenticated', 'kevin@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Kevin Mercado"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '6112ecdc-a022-5175-a9b7-e04bb794b078', 'authenticated', 'authenticated', 'trisha@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Trisha Lorenzo"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', 'ef190a68-f479-5848-a699-81453f0f5095', 'authenticated', 'authenticated', 'jerome@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Jerome Castillo"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '355a90fb-0403-5227-b94f-feedbdad490d', 'authenticated', 'authenticated', 'diego@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Diego Salvador"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', 'ef6c7e59-269a-5d5c-9534-7007b3f37648', 'authenticated', 'authenticated', 'yasmin@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Yasmin Cortez"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '7f7ee25c-0226-5328-a998-c5addebbe744', 'authenticated', 'authenticated', 'hannah@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hannah Reyes"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '63eef85d-3e17-5a85-9766-717ad7a2c543', 'authenticated', 'authenticated', 'marco@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Marco Ilagan"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '5bc9cbb1-b501-5858-8663-486bcaf8a56b', 'authenticated', 'authenticated', 'elijah@example.com', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Elijah Ponce"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change) VALUES ('00000000-0000-0000-0000-000000000000', '4d2a9f31-77bc-5e08-9a13-0c6b41f2ae90', 'authenticated', 'authenticated', 'rhea@d3800.org', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rhea Delos Santos"}', false, '', '', '', '') ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', '{"sub":"f14a7e10-1e84-5adc-90ae-949fba6c64a2","email":"mateo@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '8ac9d561-2d0a-55be-9228-7866e89508b7', '8ac9d561-2d0a-55be-9228-7866e89508b7', '{"sub":"8ac9d561-2d0a-55be-9228-7866e89508b7","email":"andrea@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), 'bec716c6-d773-5c72-8568-934ec9566d2d', 'bec716c6-d773-5c72-8568-934ec9566d2d', '{"sub":"bec716c6-d773-5c72-8568-934ec9566d2d","email":"ferdinand@d3800.org","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), 'fdd68780-e899-5cdf-b28c-d5584b1bdd05', 'fdd68780-e899-5cdf-b28c-d5584b1bdd05', '{"sub":"fdd68780-e899-5cdf-b28c-d5584b1bdd05","email":"patricia@rotaract.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), 'c16e6c94-67cf-5163-9fb4-7bff3056e618', 'c16e6c94-67cf-5163-9fb4-7bff3056e618', '{"sub":"c16e6c94-67cf-5163-9fb4-7bff3056e618","email":"camille@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '8bea3bd8-837a-5bfc-8dc9-a202e96d258e', '8bea3bd8-837a-5bfc-8dc9-a202e96d258e', '{"sub":"8bea3bd8-837a-5bfc-8dc9-a202e96d258e","email":"noel@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '8e4b923d-1889-5ab5-9180-3d098b44b0a0', '8e4b923d-1889-5ab5-9180-3d098b44b0a0', '{"sub":"8e4b923d-1889-5ab5-9180-3d098b44b0a0","email":"ramil@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), 'c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070', 'c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070', '{"sub":"c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070","email":"denise@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '74eed248-aa8d-58be-8be2-599608be879d', '74eed248-aa8d-58be-8be2-599608be879d', '{"sub":"74eed248-aa8d-58be-8be2-599608be879d","email":"oscar@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '0c82c113-cdb5-548f-82e0-8305b30fe505', '0c82c113-cdb5-548f-82e0-8305b30fe505', '{"sub":"0c82c113-cdb5-548f-82e0-8305b30fe505","email":"bianca@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '7ae426d1-252c-5051-9c97-b583c802d57f', '7ae426d1-252c-5051-9c97-b583c802d57f', '{"sub":"7ae426d1-252c-5051-9c97-b583c802d57f","email":"kevin@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '6112ecdc-a022-5175-a9b7-e04bb794b078', '6112ecdc-a022-5175-a9b7-e04bb794b078', '{"sub":"6112ecdc-a022-5175-a9b7-e04bb794b078","email":"trisha@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), 'ef190a68-f479-5848-a699-81453f0f5095', 'ef190a68-f479-5848-a699-81453f0f5095', '{"sub":"ef190a68-f479-5848-a699-81453f0f5095","email":"jerome@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '355a90fb-0403-5227-b94f-feedbdad490d', '355a90fb-0403-5227-b94f-feedbdad490d', '{"sub":"355a90fb-0403-5227-b94f-feedbdad490d","email":"diego@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), 'ef6c7e59-269a-5d5c-9534-7007b3f37648', 'ef6c7e59-269a-5d5c-9534-7007b3f37648', '{"sub":"ef6c7e59-269a-5d5c-9534-7007b3f37648","email":"yasmin@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '7f7ee25c-0226-5328-a998-c5addebbe744', '7f7ee25c-0226-5328-a998-c5addebbe744', '{"sub":"7f7ee25c-0226-5328-a998-c5addebbe744","email":"hannah@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '63eef85d-3e17-5a85-9766-717ad7a2c543', '63eef85d-3e17-5a85-9766-717ad7a2c543', '{"sub":"63eef85d-3e17-5a85-9766-717ad7a2c543","email":"marco@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '5bc9cbb1-b501-5858-8663-486bcaf8a56b', '5bc9cbb1-b501-5858-8663-486bcaf8a56b', '{"sub":"5bc9cbb1-b501-5858-8663-486bcaf8a56b","email":"elijah@example.com","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES (extensions.gen_random_uuid(), '4d2a9f31-77bc-5e08-9a13-0c6b41f2ae90', '4d2a9f31-77bc-5e08-9a13-0c6b41f2ae90', '{"sub":"4d2a9f31-77bc-5e08-9a13-0c6b41f2ae90","email":"rhea@d3800.org","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()) ON CONFLICT (provider_id, provider) DO NOTHING;

-- Profiles
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'Mateo Ramos', 'mateo@example.com', 'mateor', '22222222-2222-2222-2222-222222222201', 'Member', 'MEMBER', 'VERIFIED', NULL, '0917 210 4488') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('8ac9d561-2d0a-55be-9228-7866e89508b7', 'Andrea Villanueva', 'andrea@example.com', 'andreav', '22222222-2222-2222-2222-222222222201', 'President', 'CLUB_PRESIDENT', 'VERIFIED', NULL, '0917 550 1120') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('bec716c6-d773-5c72-8568-934ec9566d2d', 'Ferdinand Ocampo', 'ferdinand@d3800.org', 'focampo', '22222222-2222-2222-2222-222222222203', 'District Admin', 'DISTRICT_ADMIN', 'VERIFIED', NULL, '0918 640 7781') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('fdd68780-e899-5cdf-b28c-d5584b1bdd05', 'Patricia Gomez', 'patricia@rotaract.app', 'patriciag', '22222222-2222-2222-2222-222222222205', 'App Admin', 'APP_ADMIN', 'VERIFIED', NULL, '0999 300 4415') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('c16e6c94-67cf-5163-9fb4-7bff3056e618', 'Camille Bautista', 'camille@example.com', 'camilleb', '22222222-2222-2222-2222-222222222201', 'Secretary', 'MEMBER', 'VERIFIED', NULL, '0915 330 9042') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('8bea3bd8-837a-5bfc-8dc9-a202e96d258e', 'Noel Aguilar', 'noel@example.com', 'noela', '22222222-2222-2222-2222-222222222201', 'Treasurer', 'MEMBER', 'VERIFIED', NULL, '0916 471 2258') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('8e4b923d-1889-5ab5-9180-3d098b44b0a0', 'Ramil Navarro', 'ramil@example.com', 'ramiln', '22222222-2222-2222-2222-222222222202', 'President', 'CLUB_PRESIDENT', 'VERIFIED', NULL, '0919 802 3390') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070', 'Denise Fuentes', 'denise@example.com', 'denisef', '22222222-2222-2222-2222-222222222203', 'President', 'CLUB_PRESIDENT', 'VERIFIED', NULL, '0920 118 7764') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('74eed248-aa8d-58be-8be2-599608be879d', 'Oscar Delacruz', 'oscar@example.com', 'oscard', '22222222-2222-2222-2222-222222222204', 'President', 'CLUB_PRESIDENT', 'VERIFIED', NULL, '0921 245 6603') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('0c82c113-cdb5-548f-82e0-8305b30fe505', 'Bianca Salazar', 'bianca@example.com', 'biancas', '22222222-2222-2222-2222-222222222205', 'President', 'CLUB_PRESIDENT', 'VERIFIED', NULL, '0922 690 1187') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('7ae426d1-252c-5051-9c97-b583c802d57f', 'Kevin Mercado', 'kevin@example.com', 'kevinm', '22222222-2222-2222-2222-222222222202', 'Vice President', 'MEMBER', 'VERIFIED', NULL, '0923 405 7729') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('6112ecdc-a022-5175-a9b7-e04bb794b078', 'Trisha Lorenzo', 'trisha@example.com', 'trishal', '22222222-2222-2222-2222-222222222203', 'Secretary', 'MEMBER', 'VERIFIED', NULL, '0924 560 8830') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('ef190a68-f479-5848-a699-81453f0f5095', 'Jerome Castillo', 'jerome@example.com', 'jeromec', '22222222-2222-2222-2222-222222222204', 'Community Service Director', 'MEMBER', 'VERIFIED', NULL, '0925 771 9950') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('355a90fb-0403-5227-b94f-feedbdad490d', 'Diego Salvador', 'diego@example.com', 'diegos', '22222222-2222-2222-2222-222222222201', 'Member', 'MEMBER', 'AWAITING_CLUB_VALIDATION', NULL, '0917 888 1234') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('ef6c7e59-269a-5d5c-9534-7007b3f37648', 'Yasmin Cortez', 'yasmin@example.com', 'yasminc', '22222222-2222-2222-2222-222222222203', 'President', 'CLUB_PRESIDENT', 'AWAITING_DISTRICT_VALIDATION', NULL, '0918 999 5678') ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('7f7ee25c-0226-5328-a998-c5addebbe744', 'Hannah Reyes', 'hannah@example.com', 'hannah', '22222222-2222-2222-2222-222222222201', 'Secretary', 'MEMBER', 'AWAITING_CLUB_VALIDATION', NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('63eef85d-3e17-5a85-9766-717ad7a2c543', 'Marco Ilagan', 'marco@example.com', 'marco', '22222222-2222-2222-2222-222222222202', 'Member', 'MEMBER', 'VERIFIED', NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('5bc9cbb1-b501-5858-8663-486bcaf8a56b', 'Elijah Ponce', 'elijah@example.com', 'elijah', '22222222-2222-2222-2222-222222222204', 'Vice President', 'MEMBER', 'AWAITING_ADMIN_VERIFICATION', NULL, NULL) ON CONFLICT (id) DO NOTHING;

-- District Area Admin: District Admin powers scoped to their own Zone (derived
-- from their club's zone_id). Governs Zone 3 via Rotaract Club of Valenzuela.
INSERT INTO profiles (id, full_name, email, username, club_id, position, role, verification_status, avatar_url, contact_number) VALUES ('4d2a9f31-77bc-5e08-9a13-0c6b41f2ae90', 'Rhea Delos Santos', 'rhea@d3800.org', 'rdelossantos', '22222222-2222-2222-2222-222222222201', 'District Area Admin', 'DISTRICT_AREA_ADMIN', 'VERIFIED', NULL, '0917 555 0143') ON CONFLICT (id) DO NOTHING;
UPDATE profiles SET system_role = 'DISTRICT_AREA_ADMIN', club_role = 'MEMBER' WHERE id = '4d2a9f31-77bc-5e08-9a13-0c6b41f2ae90';

-- Link club presidents now that profiles exist
UPDATE clubs SET president_id = '8ac9d561-2d0a-55be-9228-7866e89508b7' WHERE id = '22222222-2222-2222-2222-222222222201';
UPDATE clubs SET president_id = '8e4b923d-1889-5ab5-9180-3d098b44b0a0' WHERE id = '22222222-2222-2222-2222-222222222202';
UPDATE clubs SET president_id = 'c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070' WHERE id = '22222222-2222-2222-2222-222222222203';
UPDATE clubs SET president_id = '74eed248-aa8d-58be-8be2-599608be879d' WHERE id = '22222222-2222-2222-2222-222222222204';
UPDATE clubs SET president_id = '0c82c113-cdb5-548f-82e0-8305b30fe505' WHERE id = '22222222-2222-2222-2222-222222222205';

-- Events
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('7280b543-08eb-52a2-b912-00e67a06d6b9', 'Tullahan Riverbank Cleanup', 'Community cleanup along the Tullahan River. Volunteers gather for waste segregation, silt clearing, and riverbank restoration.', 'SERVICE_PROJECT', 'ONGOING', '2026-08-15T11:51:53.485Z', '2026-08-15T14:51:53.486Z', 14.7, 120.9822, 'Tullahan Riverbank, Brgy. Malanday', 'Valenzuela', '22222222-2222-2222-2222-222222222201', '8ac9d561-2d0a-55be-9228-7866e89508b7', '{}'::uuid[], '{}'::uuid[], 60, false, true, 'VERIFIED_ROTARACTORS', 6, 'https://images.unsplash.com/photo-1618477388954-7852f32655ec?w=800&q=80', '+63 917 550 1120', 'events@racvalenzuela.org', ARRAY['ENVIRONMENT']::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('144bf03f-701d-5c8b-9d02-6c26ca362fcf', 'Community Health Caravan', 'Free medical and dental check-ups, blood pressure screening, and health education at the Valenzuela People''s Park covered court. Includes on-site check-in and live attendance tracking.', 'SERVICE_PROJECT', 'ONGOING', '2026-08-15T11:41:53.486Z', '2026-08-15T19:56:53.486Z', 14.7, 120.9822, 'Valenzuela People''s Park Covered Court', 'Valenzuela', '22222222-2222-2222-2222-222222222201', '8ac9d561-2d0a-55be-9228-7866e89508b7', '{}'::uuid[], '{}'::uuid[], 50, false, true, 'VERIFIED_ROTARACTORS', 12, 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80', '+63 917 550 1120', 'events@racvalenzuela.org', ARRAY['DISEASE_PREVENTION','COMMUNITY_DEVELOPMENT']::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd', 'CAMANAVA Riverways Cleanup', 'A joint CAMANAVA project between Valenzuela, Malabon and Caloocan along the Malabon–Navotas river system. Awaiting sign-off from all three club Presidents.', 'SERVICE_PROJECT', 'PENDING_APPROVAL', '2026-09-19T01:00:00.000Z', '2026-09-19T06:00:00.000Z', 14.657, 120.9569, 'Malabon–Navotas Riverbank, Brgy. Tañong', 'Malabon', '22222222-2222-2222-2222-222222222201', 'c16e6c94-67cf-5163-9fb4-7bff3056e618', ARRAY['7ae426d1-252c-5051-9c97-b583c802d57f','6112ecdc-a022-5175-a9b7-e04bb794b078']::uuid[], ARRAY['22222222-2222-2222-2222-222222222202']::uuid[], 120, false, true, 'VERIFIED_ROTARACTORS', 24, NULL, NULL, NULL, ARRAY['ENVIRONMENT']::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('bb935735-4116-57ad-9075-8e4fd3d33be7', 'Back-to-School Supply Drive', 'Packing and handing out school kits — notebooks, pencils, and bags — to 150 public-school pupils ahead of the new term.', 'SERVICE_PROJECT', 'RECRUITING', '2026-08-29T01:00:00.000Z', '2026-08-29T05:00:00.000Z', 14.7, 120.9822, 'Valenzuela Elementary School', 'Valenzuela', '22222222-2222-2222-2222-222222222201', '8ac9d561-2d0a-55be-9228-7866e89508b7', '{}'::uuid[], '{}'::uuid[], 80, false, true, 'VERIFIED_ROTARACTORS', 24, 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80', '+63 917 550 1120', 'projects@racvalenzuela.org', ARRAY['EDUCATION_LITERACY','COMMUNITY_DEVELOPMENT']::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('cd6c41fe-4854-5a5f-af7d-89c720aea859', 'Zone 2 Fellowship Night', 'Casual dinner, team-building trivia, and games with fellow Rotaractors from Zone 2. Bring a friend!', 'FELLOWSHIP', 'SCHEDULED', '2026-08-21T11:00:00.000Z', '2026-08-21T14:00:00.000Z', 14.6499, 120.967, 'Caloocan Sports Complex', 'Caloocan', '22222222-2222-2222-2222-222222222203', 'c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070', '{}'::uuid[], '{}'::uuid[], 60, true, true, 'VERIFIED_ROTARACTORS', 12, 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&q=80', '+63 920 118 7764', 'fellowship@raccaloocan.org', '{}'::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('4bb077a7-abbd-5a6d-9b8a-9c31b7a180cd', 'Feeding Program — Barangay Nangka', 'Serving hot, nutritious meals to 200 children in Barangay Nangka. Volunteers needed for food prep, serving, and storytelling.', 'SERVICE_PROJECT', 'RECRUITING', '2026-08-27T01:00:00.000Z', '2026-08-27T06:00:00.000Z', 14.6507, 121.1029, 'Barangay Nangka Covered Court', 'Marikina', '22222222-2222-2222-2222-222222222204', '74eed248-aa8d-58be-8be2-599608be879d', '{}'::uuid[], '{}'::uuid[], 30, false, false, 'VERIFIED_ROTARACTORS', 24, 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&q=80', '+63 921 245 6603', 'community@racmarikina.org', ARRAY['MATERNAL_CHILD_HEALTH','COMMUNITY_DEVELOPMENT']::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('2f8d8834-1acd-5946-9027-61e703e2b21c', 'Riverside Tree Planting', 'Reforestation along the Tullahan riverbank buffer, planting 500 native seedlings to stabilize the banks and improve water quality.', 'SERVICE_PROJECT', 'COMPLETED', '2026-08-08T22:00:00.000Z', '2026-08-09T07:00:00.000Z', 14.6499, 120.967, 'Tullahan Riverbank Buffer, Caloocan', 'Caloocan', '22222222-2222-2222-2222-222222222203', 'c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070', '{}'::uuid[], '{}'::uuid[], 100, false, true, 'VERIFIED_ROTARACTORS', 6, 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&q=80', '+63 920 118 7764', 'eco@raccaloocan.org', ARRAY['ENVIRONMENT']::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('843649b8-f504-5334-a2e0-e27c37609476', 'District Leadership Assembly 2026', 'Annual assembly for all Rotaract clubs across District 3800 featuring keynote speakers, leadership workshops, and networking.', 'FELLOWSHIP', 'SCHEDULED', '2026-09-06T00:00:00.000Z', '2026-09-06T09:00:00.000Z', 14.5794, 121.0359, 'Mandaluyong City Convention Center', 'Mandaluyong', '22222222-2222-2222-2222-222222222205', '0c82c113-cdb5-548f-82e0-8305b30fe505', '{}'::uuid[], '{}'::uuid[], 300, false, true, 'VERIFIED_ROTARACTORS', 24, 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&q=80', '+63 922 690 1187', 'assembly@racmandaluyong.org', '{}'::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('78d5164d-9f80-5fb6-9d46-648c7869c6f1', 'Bloodletting Program', 'Partnered with the Philippine Red Cross. Mobile donation station set up at the Valenzuela public market.', 'SERVICE_PROJECT', 'COMPLETED', '2026-07-18T01:00:00.000Z', '2026-07-18T07:00:00.000Z', 14.7, 120.9822, 'Valenzuela Public Market', 'Valenzuela', '22222222-2222-2222-2222-222222222201', '8ac9d561-2d0a-55be-9228-7866e89508b7', '{}'::uuid[], '{}'::uuid[], 50, false, true, 'VERIFIED_ROTARACTORS', 24, 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=800&q=80', '+63 917 550 1120', 'health@racvalenzuela.org', ARRAY['DISEASE_PREVENTION']::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('dc933450-4842-5d19-8771-b4ed36d42167', 'Club Officers Planning Retreat', 'Internal strategy planning session for Rotaract Club of Valenzuela executive officers.', 'FELLOWSHIP', 'SCHEDULED', '2026-08-30T02:00:00.000Z', '2026-08-30T09:00:00.000Z', 14.7, 120.9822, 'Valenzuela Clubhouse', 'Valenzuela', '22222222-2222-2222-2222-222222222201', '8ac9d561-2d0a-55be-9228-7866e89508b7', '{}'::uuid[], '{}'::uuid[], 20, false, false, 'CLUB_ONLY', 12, 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80', '+63 917 550 1120', 'board@racvalenzuela.org', '{}'::area_of_focus[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO events (id, title, description, event_type, status, start_datetime, end_datetime, latitude, longitude, address, city, organizing_club_id, organizer_user_id, co_organizer_user_ids, approved_by_club_ids, max_participants, requires_approval, allow_participant_invites, visibility, lock_leave_cutoff_hours, cover_photo, contact_number, contact_email, areas_of_focus) VALUES ('4dd3a724-95ad-504e-99db-da07c976092d', 'Typhoon Relief Repacking', 'Relief packing and distribution for families displaced by flooding across Valenzuela and the CAMANAVA area.', 'SERVICE_PROJECT', 'CANCELLED', '2026-08-24T01:00:00.000Z', '2026-08-24T07:00:00.000Z', 14.7, 120.9822, 'Valenzuela People''s Park Covered Court', 'Valenzuela', '22222222-2222-2222-2222-222222222201', '8ac9d561-2d0a-55be-9228-7866e89508b7', '{}'::uuid[], '{}'::uuid[], 80, false, true, 'VERIFIED_ROTARACTORS', 24, 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=800&q=80', '+63 917 550 1120', 'relief@racvalenzuela.org', ARRAY['COMMUNITY_DEVELOPMENT']::area_of_focus[]) ON CONFLICT (id) DO NOTHING;

-- Event participating clubs

-- event_participating_clubs is intentionally NOT seeded. It previously held 15
-- co-hosting partner rows; co-hosting was removed as a feature. The column now
-- means "clubs involved" (organizing club + co-organizers' clubs) and is written
-- by the app on create/edit, so seeding stale co-host links would misrepresent it.

-- Event participants
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('e0a10ff0-1057-573a-a979-15d5be5a044f', '7280b543-08eb-52a2-b912-00e67a06d6b9', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'JOINED', 'NOT_MARKED', '2026-08-10T00:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('ff54bfcd-0477-5090-917b-0f81bb571c9a', '51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd', 'c16e6c94-67cf-5163-9fb4-7bff3056e618', 'JOINED', 'NOT_MARKED', '2026-08-10T00:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('1da91ef4-b73a-51cd-a0e5-a52e8ca3f556', '51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd', '7ae426d1-252c-5051-9c97-b583c802d57f', 'JOINED', 'NOT_MARKED', '2026-08-10T00:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('d1a77fd7-9b10-5b72-9821-e6f6638ebd2c', '51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd', '6112ecdc-a022-5175-a9b7-e04bb794b078', 'JOINED', 'NOT_MARKED', '2026-08-10T00:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('b77afa09-3618-5f90-ae94-36872144ebb8', 'bb935735-4116-57ad-9075-8e4fd3d33be7', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'JOINED', 'NOT_MARKED', '2026-08-04T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('13cb11f1-c825-536e-a174-aa845d542900', 'cd6c41fe-4854-5a5f-af7d-89c720aea859', 'c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070', 'JOINED', 'NOT_MARKED', '2026-08-04T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('0c319d28-01e8-5d7b-a28f-0a50b983e4be', '4bb077a7-abbd-5a6d-9b8a-9c31b7a180cd', '74eed248-aa8d-58be-8be2-599608be879d', 'JOINED', 'NOT_MARKED', '2026-08-04T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('4bbee730-6462-5aaf-bf8c-5505e41f84fe', '2f8d8834-1acd-5946-9027-61e703e2b21c', 'c5e0bf44-9bd9-5fca-b88a-2dbb2bd94070', 'JOINED', 'ATTENDED', '2026-08-01T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('9b26e8f3-b295-5306-88b5-0c0dd18520d8', '843649b8-f504-5334-a2e0-e27c37609476', '0c82c113-cdb5-548f-82e0-8305b30fe505', 'JOINED', 'NOT_MARKED', '2026-08-04T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('041ef928-a5e0-5f20-a6ea-e42ae22a8448', '78d5164d-9f80-5fb6-9d46-648c7869c6f1', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'JOINED', 'ATTENDED', '2026-07-05T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('ec940c4e-efcd-58d6-88c5-e4202269d9dd', 'dc933450-4842-5d19-8771-b4ed36d42167', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'JOINED', 'NOT_MARKED', '2026-08-04T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('ae3615c9-d70b-53de-9567-c1afb0dea0e3', '4dd3a724-95ad-504e-99db-da07c976092d', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'JOINED', 'NOT_MARKED', '2026-08-10T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('18a9e0f0-58a4-58c2-b91b-f9bfc6295ed0', 'bb935735-4116-57ad-9075-8e4fd3d33be7', 'c16e6c94-67cf-5163-9fb4-7bff3056e618', 'JOINED', 'NOT_MARKED', '2026-08-04T10:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('8ad3c7af-4262-526b-940b-4b8171ccc1b5', 'bb935735-4116-57ad-9075-8e4fd3d33be7', '8bea3bd8-837a-5bfc-8dc9-a202e96d258e', 'JOINED', 'NOT_MARKED', '2026-08-05T10:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('550bbcd8-3f5e-54b0-a18d-cacde00e3ff4', '2f8d8834-1acd-5946-9027-61e703e2b21c', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'JOINED', 'ATTENDED', '2026-08-01T10:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('d801d2d8-77af-50f6-97bc-426c9ddfe49b', '78d5164d-9f80-5fb6-9d46-648c7869c6f1', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'JOINED', 'ATTENDED', '2026-07-05T10:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('2d3687d4-6942-59e8-a65c-7a1c2472023a', '78d5164d-9f80-5fb6-9d46-648c7869c6f1', 'c16e6c94-67cf-5163-9fb4-7bff3056e618', 'JOINED', 'ATTENDED', '2026-07-05T10:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('a515fe86-26f1-5146-88d3-f33f9cbb888a', 'cd6c41fe-4854-5a5f-af7d-89c720aea859', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'PENDING', 'NOT_MARKED', '2026-08-05T10:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('e8cf66ab-2576-5406-aac0-aa9443c16bb7', '7280b543-08eb-52a2-b912-00e67a06d6b9', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'JOINED', 'NOT_MARKED', '2026-08-11T08:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('d1e7efa3-64cd-5478-8ca9-3e22e02819dd', '7280b543-08eb-52a2-b912-00e67a06d6b9', 'c16e6c94-67cf-5163-9fb4-7bff3056e618', 'JOINED', 'NOT_MARKED', '2026-08-11T08:05:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('a87fd476-cb3a-5d2f-945a-1c1fb0690983', '144bf03f-701d-5c8b-9d02-6c26ca362fcf', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'JOINED', 'NOT_MARKED', '2026-08-11T08:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('5d2e4017-31eb-53fd-b348-7615d78801d3', '144bf03f-701d-5c8b-9d02-6c26ca362fcf', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'JOINED', 'NOT_MARKED', '2026-08-11T08:05:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('d3fca955-2b38-5a19-9adf-7effd2767e68', '144bf03f-701d-5c8b-9d02-6c26ca362fcf', 'bec716c6-d773-5c72-8568-934ec9566d2d', 'JOINED', 'NOT_MARKED', '2026-08-11T08:10:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('5272b007-9911-55ad-b7c7-633ffad83edb', '144bf03f-701d-5c8b-9d02-6c26ca362fcf', 'fdd68780-e899-5cdf-b28c-d5584b1bdd05', 'JOINED', 'NOT_MARKED', '2026-08-11T08:15:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('c75f00be-8ee6-5405-8c33-90ff429dd3cc', '51dc9b23-05c1-5cbf-8dd0-b6cf6b821fdd', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'JOINED', 'NOT_MARKED', '2026-08-11T08:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;
INSERT INTO event_participants (id, event_id, user_id, status, attendance_status, joined_at, checked_in_at, check_in_latitude, check_in_longitude, check_in_distance_m, check_in_method) VALUES ('8e1cb6e6-075a-595c-8960-2c6867df85e1', '4dd3a724-95ad-504e-99db-da07c976092d', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'JOINED', 'NOT_MARKED', '2026-08-11T09:00:00.000Z', NULL, NULL, NULL, NULL, 'SELF_GPS') ON CONFLICT (id) DO NOTHING;

-- Event invitations
INSERT INTO event_invitations (id, event_id, invited_user_id, invited_by_user_id, status, sent_at, decline_reason) VALUES ('f083c5b5-489c-5738-a4ff-9a062095db62', '843649b8-f504-5334-a2e0-e27c37609476', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', '0c82c113-cdb5-548f-82e0-8305b30fe505', 'PENDING', '2026-08-08T10:00:00.000Z', NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO event_invitations (id, event_id, invited_user_id, invited_by_user_id, status, sent_at, decline_reason) VALUES ('27e9b8ea-b15a-51a9-ab68-32c961f02215', '4bb077a7-abbd-5a6d-9b8a-9c31b7a180cd', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', '74eed248-aa8d-58be-8be2-599608be879d', 'PENDING', '2026-08-09T10:00:00.000Z', NULL) ON CONFLICT (id) DO NOTHING;

-- Event impacts
INSERT INTO event_impacts (event_id, volunteer_hours, beneficiaries, funds_raised, items_distributed, trees_planted, impact_summary) VALUES ('78d5164d-9f80-5fb6-9d46-648c7869c6f1', 52, 140, 0, 0, 0, '42 blood bags collected, aiding the regional blood bank''s trauma and maternity reserves.') ON CONFLICT (event_id) DO NOTHING;
INSERT INTO event_impacts (event_id, volunteer_hours, beneficiaries, funds_raised, items_distributed, trees_planted, impact_summary) VALUES ('2f8d8834-1acd-5946-9027-61e703e2b21c', 96, 0, 0, 0, 500, '500 native seedlings planted along the Tullahan riverbank buffer.') ON CONFLICT (event_id) DO NOTHING;

-- Verification applications
INSERT INTO verification_applications (id, user_id, full_name, email, club_id, member_id, position, status, proof_url, submitted_at, notes) VALUES ('f570a24c-489f-5680-9731-359cc7417258', '355a90fb-0403-5227-b94f-feedbdad490d', 'Diego Salvador', 'diego@example.com', '22222222-2222-2222-2222-222222222201', '10482931', 'Member', 'AWAITING_CLUB_VALIDATION', NULL, '2026-08-08T10:00:00.000Z', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO verification_applications (id, user_id, full_name, email, club_id, member_id, position, status, proof_url, submitted_at, notes) VALUES ('178e7cf9-0004-50ea-a6d6-0540e504c9ca', '7f7ee25c-0226-5328-a998-c5addebbe744', 'Hannah Reyes', 'hannah@example.com', '22222222-2222-2222-2222-222222222201', '10482932', 'Secretary', 'AWAITING_CLUB_VALIDATION', NULL, '2026-08-09T10:00:00.000Z', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO verification_applications (id, user_id, full_name, email, club_id, member_id, position, status, proof_url, submitted_at, notes) VALUES ('46ca3053-cdf5-58dc-afdf-3e10c7192cb6', '63eef85d-3e17-5a85-9766-717ad7a2c543', 'Marco Ilagan', 'marco@example.com', '22222222-2222-2222-2222-222222222202', '10482933', 'Member', 'VERIFIED', NULL, '2026-08-05T10:00:00.000Z', 'Verified member per club roster.') ON CONFLICT (id) DO NOTHING;
INSERT INTO verification_applications (id, user_id, full_name, email, club_id, member_id, position, status, proof_url, submitted_at, notes) VALUES ('6cb38cea-f9e5-578e-adba-1432243a2b5a', 'ef6c7e59-269a-5d5c-9534-7007b3f37648', 'Yasmin Cortez', 'yasmin@example.com', '22222222-2222-2222-2222-222222222203', '10482934', 'President', 'AWAITING_DISTRICT_VALIDATION', NULL, '2026-08-06T10:00:00.000Z', 'Recently elected president of new charter club.') ON CONFLICT (id) DO NOTHING;
INSERT INTO verification_applications (id, user_id, full_name, email, club_id, member_id, position, status, proof_url, submitted_at, notes) VALUES ('2cd20bfd-9067-56fe-942d-1eb18c2d3c26', '5bc9cbb1-b501-5858-8663-486bcaf8a56b', 'Elijah Ponce', 'elijah@example.com', '22222222-2222-2222-2222-222222222204', '10482935', 'Vice President', 'AWAITING_ADMIN_VERIFICATION', NULL, '2026-08-04T10:00:00.000Z', '') ON CONFLICT (id) DO NOTHING;

-- Audit logs
INSERT INTO audit_logs (id, application_id, action, performed_by_name, performed_by_role, previous_status, new_status, notes, created_at) VALUES ('e3455770-5393-59aa-a5e1-982531241baa', '46ca3053-cdf5-58dc-afdf-3e10c7192cb6', 'CLUB_VALIDATE', 'Ramil Navarro', 'CLUB_PRESIDENT', 'AWAITING_CLUB_VALIDATION', 'AWAITING_ADMIN_VERIFICATION', 'Verified member per club roster.', '2026-08-07T10:00:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, application_id, action, performed_by_name, performed_by_role, previous_status, new_status, notes, created_at) VALUES ('8d61a24b-bb6b-5687-a47b-40beb5e1eccb', '2cd20bfd-9067-56fe-942d-1eb18c2d3c26', 'CLUB_VALIDATE', 'Oscar Delacruz', 'CLUB_PRESIDENT', 'AWAITING_CLUB_VALIDATION', 'AWAITING_ADMIN_VERIFICATION', '', '2026-08-05T10:00:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO audit_logs (id, application_id, action, performed_by_name, performed_by_role, previous_status, new_status, notes, created_at) VALUES ('0a9dc6b3-74ac-53fe-98bb-89600b051265', '46ca3053-cdf5-58dc-afdf-3e10c7192cb6', 'ADMIN_APPROVE', 'Patricia Gomez', 'APP_ADMIN', 'AWAITING_ADMIN_VERIFICATION', 'VERIFIED', 'Final verification complete.', '2026-08-08T09:00:00.000Z') ON CONFLICT (id) DO NOTHING;

-- Conversations
INSERT INTO conversations (id, event_id, event_title, is_group, participant_user_id, organizer_user_id, last_message, last_message_at) VALUES ('dc938108-cd1e-5061-939b-4ec4a6e9009f', '7280b543-08eb-52a2-b912-00e67a06d6b9', 'Tullahan Riverbank Cleanup', false, 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'Hi President Andrea! Will there be parking near the Tullahan riverbank site?', '2026-08-11T13:30:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO conversations (id, event_id, event_title, is_group, participant_user_id, organizer_user_id, last_message, last_message_at) VALUES ('ecd8c4fb-375c-5a3f-81b4-f54de96e7bfd', '7280b543-08eb-52a2-b912-00e67a06d6b9', 'Tullahan Riverbank Cleanup', true, NULL, '8ac9d561-2d0a-55be-9228-7866e89508b7', 'President Andrea: We''re set up at the main tent — grab gloves and bags!', '2026-08-11T13:40:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO conversations (id, event_id, event_title, is_group, participant_user_id, organizer_user_id, last_message, last_message_at) VALUES ('6343e04d-6b0d-59ee-a11b-bf9072706575', 'bb935735-4116-57ad-9075-8e4fd3d33be7', 'Back-to-School Supply Drive', true, NULL, '8ac9d561-2d0a-55be-9228-7866e89508b7', 'Camille Bautista: I''ve sorted the notebooks by grade level.', '2026-08-10T09:15:00.000Z') ON CONFLICT (id) DO NOTHING;

-- Notifications
INSERT INTO notifications (id, user_id, kind, title, message, event_id, application_id, conversation_id, is_read, created_at) VALUES ('0c817b2e-2e23-5b72-bd37-c4f6b1f7e90f', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'INVITATION_RECEIVED', 'You were invited', 'Bianca Salazar invited you to District Leadership Assembly 2026.', '843649b8-f504-5334-a2e0-e27c37609476', NULL, NULL, false, '2026-08-08T10:00:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO notifications (id, user_id, kind, title, message, event_id, application_id, conversation_id, is_read, created_at) VALUES ('e7530a9b-9bdb-517f-bded-ce0bc9065d07', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'INVITATION_RECEIVED', 'You were invited', 'Oscar Delacruz invited you to Feeding Program — Barangay Nangka.', '4bb077a7-abbd-5a6d-9b8a-9c31b7a180cd', NULL, NULL, false, '2026-08-09T10:00:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO notifications (id, user_id, kind, title, message, event_id, application_id, conversation_id, is_read, created_at) VALUES ('ce948dcd-eb8a-5681-afc0-ce746d8077d7', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'MEMBERSHIP_REQUEST', 'New membership request', 'Diego Salvador applied to join Rotaract Club of Valenzuela.', NULL, 'f570a24c-489f-5680-9731-359cc7417258', NULL, false, '2026-08-08T10:05:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO notifications (id, user_id, kind, title, message, event_id, application_id, conversation_id, is_read, created_at) VALUES ('7302473b-febd-5b68-882b-6b5637562236', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'MEMBERSHIP_REQUEST', 'New membership request', 'Hannah Reyes applied to join Rotaract Club of Valenzuela.', NULL, '178e7cf9-0004-50ea-a6d6-0540e504c9ca', NULL, false, '2026-08-09T10:05:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO notifications (id, user_id, kind, title, message, event_id, application_id, conversation_id, is_read, created_at) VALUES ('a19f473d-8dae-5466-bbad-b0d2a978d4c3', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'INQUIRY_RECEIVED', 'Inquiry from Mateo Ramos', 'Hi President Andrea! Will there be parking near the Tullahan riverbank site?', '7280b543-08eb-52a2-b912-00e67a06d6b9', NULL, 'dc938108-cd1e-5061-939b-4ec4a6e9009f', false, '2026-08-11T13:30:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO notifications (id, user_id, kind, title, message, event_id, application_id, conversation_id, is_read, created_at) VALUES ('35195086-5280-5b5d-9891-5881348e03e0', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', 'EVENT_UPDATE', 'Event Cancelled: Typhoon Relief Repacking', 'Reason: Postponed due to severe weather warning and localized flooding along access roads.', '4dd3a724-95ad-504e-99db-da07c976092d', NULL, NULL, false, '2026-08-12T09:00:00.000Z') ON CONFLICT (id) DO NOTHING;

-- Direct messages
INSERT INTO direct_messages (id, conversation_id, event_id, sender_id, receiver_id, text, created_at) VALUES ('70ab825b-1e99-5959-8452-2ad83bfca24f', 'dc938108-cd1e-5061-939b-4ec4a6e9009f', '7280b543-08eb-52a2-b912-00e67a06d6b9', 'f14a7e10-1e84-5adc-90ae-949fba6c64a2', '8ac9d561-2d0a-55be-9228-7866e89508b7', 'Hi President Andrea! Will there be parking near the Tullahan riverbank site?', '2026-08-11T13:30:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO direct_messages (id, conversation_id, event_id, sender_id, receiver_id, text, created_at) VALUES ('7e9cb7e6-f1e3-5aca-92bb-bc5d3fa37418', 'ecd8c4fb-375c-5a3f-81b4-f54de96e7bfd', '7280b543-08eb-52a2-b912-00e67a06d6b9', '8ac9d561-2d0a-55be-9228-7866e89508b7', NULL, 'We''re set up at the main tent — grab gloves and bags!', '2026-08-11T13:40:00.000Z') ON CONFLICT (id) DO NOTHING;
INSERT INTO direct_messages (id, conversation_id, event_id, sender_id, receiver_id, text, created_at) VALUES ('9e35d31e-39d6-57f4-8b12-2c9b17d6491b', '6343e04d-6b0d-59ee-a11b-bf9072706575', 'bb935735-4116-57ad-9075-8e4fd3d33be7', 'c16e6c94-67cf-5163-9fb4-7bff3056e618', NULL, 'I''ve sorted the notebooks by grade level.', '2026-08-10T09:15:00.000Z') ON CONFLICT (id) DO NOTHING;
