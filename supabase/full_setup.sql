-- =============================================================================
-- ROTARACT CONNECT — COMPLETE SUPABASE DATABASE SETUP & SEED
-- =============================================================================
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path = public, extensions, auth, storage;
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
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE PUBLICATION "supabase_realtime";
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage Buckets Setup
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('event-covers', 'event-covers', true),
  ('verification-proofs', 'verification-proofs', false)
ON CONFLICT (id) DO NOTHING;


-- >>> Migration: supabase/migrations/0027_decouple_system_and_club_roles.sql >>>
SET search_path = public, extensions, auth, storage;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path = public, extensions, auth, storage;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;









CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';










CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";













CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."area_of_focus" AS ENUM (
    'PEACEBUILDING',
    'DISEASE_PREVENTION',
    'WATER_SANITATION',
    'MATERNAL_CHILD_HEALTH',
    'EDUCATION_LITERACY',
    'COMMUNITY_DEVELOPMENT',
    'ENVIRONMENT'
);


ALTER TYPE "public"."area_of_focus" OWNER TO "postgres";


CREATE TYPE "public"."attendance_status" AS ENUM (
    'NOT_MARKED',
    'ATTENDED',
    'ABSENT'
);


ALTER TYPE "public"."attendance_status" OWNER TO "postgres";


CREATE TYPE "public"."check_in_method" AS ENUM (
    'SELF_GPS',
    'ORGANIZER',
    'ORGANIZER_QR'
);


ALTER TYPE "public"."check_in_method" OWNER TO "postgres";


CREATE TYPE "public"."event_status" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'PUBLISHED',
    'RECRUITING',
    'SCHEDULED',
    'ONGOING',
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE "public"."event_status" OWNER TO "postgres";


CREATE TYPE "public"."event_type" AS ENUM (
    'SERVICE_PROJECT',
    'FELLOWSHIP',
    'DISTRICT_EVENT'
);


ALTER TYPE "public"."event_type" OWNER TO "postgres";


CREATE TYPE "public"."event_visibility" AS ENUM (
    'VERIFIED_ROTARACTORS',
    'CLUB_ONLY',
    'INVITATION_ONLY'
);


ALTER TYPE "public"."event_visibility" OWNER TO "postgres";


CREATE TYPE "public"."invitation_status" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED'
);


ALTER TYPE "public"."invitation_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_kind" AS ENUM (
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


ALTER TYPE "public"."notification_kind" OWNER TO "postgres";


CREATE TYPE "public"."participation_status" AS ENUM (
    'PENDING',
    'JOINED',
    'CANCELLED'
);


ALTER TYPE "public"."participation_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'MEMBER',
    'CLUB_PRESIDENT',
    'DISTRICT_ADMIN',
    'APP_ADMIN',
    'DISTRICT_AREA_ADMIN'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."verification_status" AS ENUM (
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


ALTER TYPE "public"."verification_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_delete_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_role"("p_user_id" "uuid", "p_role" "text", "p_system_role" "text" DEFAULT NULL::"text", "p_club_role" "text" DEFAULT NULL::"text", "p_position" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_set_role"("p_user_id" "uuid", "p_role" "text", "p_system_role" "text", "p_club_role" "text", "p_position" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "event_type" "public"."event_type" NOT NULL,
    "status" "public"."event_status" DEFAULT 'DRAFT'::"public"."event_status" NOT NULL,
    "start_datetime" timestamp with time zone NOT NULL,
    "end_datetime" timestamp with time zone NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "address" "text" NOT NULL,
    "city" "text" NOT NULL,
    "organizing_club_id" "uuid" NOT NULL,
    "organizer_user_id" "uuid" NOT NULL,
    "co_organizer_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "approved_by_club_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "max_participants" integer DEFAULT 50 NOT NULL,
    "requires_approval" boolean DEFAULT false NOT NULL,
    "allow_participant_invites" boolean DEFAULT true NOT NULL,
    "visibility" "public"."event_visibility" DEFAULT 'VERIFIED_ROTARACTORS'::"public"."event_visibility" NOT NULL,
    "lock_leave_cutoff_hours" integer DEFAULT 24 NOT NULL,
    "cover_photo" "text",
    "contact_number" "text",
    "contact_email" "text",
    "areas_of_focus" "public"."area_of_focus"[] DEFAULT '{}'::"public"."area_of_focus"[],
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reminder_24h_sent_at" timestamp with time zone,
    "reminder_1h_sent_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."events" REPLICA IDENTITY FULL;


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_event"("p_event_id" "uuid") RETURNS "public"."events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  -- Idempotent: approving an already-published event is a no-op, not an error, so a
  -- double tap or a retry cannot corrupt state.
  IF v_ev.status <> 'PENDING_APPROVAL' THEN RETURN v_ev; END IF;

  IF v_ev.event_type = 'DISTRICT_EVENT' THEN
    IF v_actor.role NOT IN ('DISTRICT_ADMIN', 'APP_ADMIN') THEN
      RAISE EXCEPTION 'Only a District Administrator can approve a District Event';
    END IF;
    UPDATE events SET status = 'RECRUITING' WHERE id = p_event_id RETURNING * INTO v_ev;
    RETURN v_ev;
  END IF;

  -- Every club with skin in the game: organiser, partners, co-organisers' clubs.
  SELECT ARRAY(
    SELECT DISTINCT c FROM unnest(
      ARRAY[v_ev.organizing_club_id]
      || COALESCE(ARRAY(SELECT club_id FROM event_participating_clubs WHERE event_id = p_event_id), '{}')
      || COALESCE(ARRAY(SELECT club_id FROM profiles WHERE id = ANY(v_ev.co_organizer_user_ids) AND club_id IS NOT NULL), '{}')
    ) AS c WHERE c IS NOT NULL
  ) INTO v_approver_clubs;

  IF v_actor.role IN ('DISTRICT_ADMIN', 'APP_ADMIN') THEN
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


ALTER FUNCTION "public"."approve_event"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_event_with_clubs"("p_event" "jsonb", "p_participating_club_ids" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "public"."events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_event_with_clubs"("p_event" "jsonb", "p_participating_club_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."email_for_username"("p_username" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT email FROM profiles WHERE lower(username) = lower(p_username) LIMIT 1;
$$;


ALTER FUNCTION "public"."email_for_username"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_notification_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."enforce_notification_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."event_approver_club_ids"("ev" "public"."events") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."event_approver_club_ids"("ev" "public"."events") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_invitation_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."guard_invitation_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_verification_application_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only reviewers can change application status';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_verification_application_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_conversation_member"("p_conv" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."is_conversation_member"("p_conv" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_push_deliveries"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM push_deliveries WHERE created_at < now() - interval '3 days';
$$;


ALTER FUNCTION "public"."prune_push_deliveries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_application"("p_app_id" "uuid", "p_action" "text", "p_notes" "text" DEFAULT ''::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."review_application"("p_app_id" "uuid", "p_action" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_event_broadcast"("p_event_id" "uuid", "p_title" "text", "p_message" "text", "p_priority" "text" DEFAULT 'NORMAL'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."send_event_broadcast"("p_event_id" "uuid", "p_title" "text", "p_message" "text", "p_priority" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_event_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."send_event_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unsend_message"("p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."unsend_message"("p_message_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "performed_by_name" "text" NOT NULL,
    "performed_by_role" "public"."user_role" NOT NULL,
    "previous_status" "public"."verification_status" NOT NULL,
    "new_status" "public"."verification_status" NOT NULL,
    "notes" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."audit_logs" REPLICA IDENTITY FULL;


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_name" "text" NOT NULL,
    "club_code" "text" NOT NULL,
    "zone_id" "uuid",
    "city" "text" NOT NULL,
    "province" "text" DEFAULT 'Metro Manila'::"text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "member_count" integer DEFAULT 0 NOT NULL,
    "president_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "club_type" "text" DEFAULT 'COMMUNITY_BASED'::"text",
    "institution_name" "text"
);

ALTER TABLE ONLY "public"."clubs" REPLICA IDENTITY FULL;


ALTER TABLE "public"."clubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_states" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."conversation_states" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversation_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid",
    "event_title" "text",
    "is_group" boolean DEFAULT false NOT NULL,
    "participant_user_id" "uuid",
    "organizer_user_id" "uuid" NOT NULL,
    "last_message" "text" DEFAULT ''::"text",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid",
    "text" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachment_path" "text",
    "attachment_type" "text",
    "deleted_at" timestamp with time zone,
    "is_broadcast" boolean DEFAULT false NOT NULL,
    "mentioned_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "attachment_width" integer,
    "attachment_height" integer
);

ALTER TABLE ONLY "public"."direct_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."direct_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_impacts" (
    "event_id" "uuid" NOT NULL,
    "volunteer_hours" integer DEFAULT 0 NOT NULL,
    "beneficiaries" integer DEFAULT 0 NOT NULL,
    "funds_raised" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "items_distributed" integer DEFAULT 0 NOT NULL,
    "trees_planted" integer DEFAULT 0 NOT NULL,
    "impact_summary" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_impacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "invited_user_id" "uuid" NOT NULL,
    "invited_by_user_id" "uuid" NOT NULL,
    "status" "public"."invitation_status" DEFAULT 'PENDING'::"public"."invitation_status" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decline_reason" "text"
);


ALTER TABLE "public"."event_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "public"."participation_status" DEFAULT 'PENDING'::"public"."participation_status" NOT NULL,
    "attendance_status" "public"."attendance_status" DEFAULT 'NOT_MARKED'::"public"."attendance_status" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checked_in_at" timestamp with time zone,
    "check_in_latitude" double precision,
    "check_in_longitude" double precision,
    "check_in_distance_m" double precision,
    "check_in_method" "public"."check_in_method" DEFAULT 'SELF_GPS'::"public"."check_in_method" NOT NULL,
    "checked_out_at" timestamp with time zone,
    "check_out_latitude" double precision,
    "check_out_longitude" double precision,
    "check_out_distance_m" double precision,
    "check_out_method" "text"
);

ALTER TABLE ONLY "public"."event_participants" REPLICA IDENTITY FULL;


ALTER TABLE "public"."event_participants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."event_participants"."checked_out_at" IS 'When the participant checked out of the event on-site, manually, or via 60-minute perimeter auto-leave';



COMMENT ON COLUMN "public"."event_participants"."check_out_method" IS 'Method of check-out: SELF_GPS, AUTO_PERIMETER_LEAVE, or ORGANIZER';



CREATE TABLE IF NOT EXISTS "public"."event_participating_clubs" (
    "event_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."event_participating_clubs" REPLICA IDENTITY FULL;


ALTER TABLE "public"."event_participating_clubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_deletions" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."message_deletions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."message_deletions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reads" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_read_message_id" "uuid"
);

ALTER TABLE ONLY "public"."message_reads" REPLICA IDENTITY FULL;


ALTER TABLE "public"."message_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "public"."notification_kind" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "event_id" "uuid",
    "application_id" "uuid",
    "conversation_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "priority" "text" DEFAULT 'NORMAL'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "notifications_priority_check" CHECK (("priority" = ANY (ARRAY['NORMAL'::"text", 'ALERT'::"text", 'HIGH'::"text"])))
);

ALTER TABLE ONLY "public"."notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "username" "text" NOT NULL,
    "club_id" "uuid",
    "position" "text" DEFAULT 'Member'::"text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'MEMBER'::"public"."user_role" NOT NULL,
    "verification_status" "public"."verification_status" DEFAULT 'PENDING'::"public"."verification_status" NOT NULL,
    "avatar_url" "text",
    "contact_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "allow_direct_inquiries" boolean DEFAULT true NOT NULL,
    "contact_privacy" "text" DEFAULT 'ALL_VERIFIED'::"text",
    "system_role" "text" DEFAULT 'NONE'::"text",
    "club_role" "text" DEFAULT 'MEMBER'::"text",
    CONSTRAINT "profiles_club_role_check" CHECK (("club_role" = ANY (ARRAY['CLUB_PRESIDENT'::"text", 'OFFICER'::"text", 'MEMBER'::"text"]))),
    CONSTRAINT "profiles_system_role_check" CHECK (("system_role" = ANY (ARRAY['APP_ADMIN'::"text", 'DISTRICT_ADMIN'::"text", 'NONE'::"text"])))
);

ALTER TABLE ONLY "public"."profiles" REPLICA IDENTITY FULL;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."allow_direct_inquiries" IS 'When false, only same-club members may start a new 1-on-1 conversation with this user.';



CREATE TABLE IF NOT EXISTS "public"."push_deliveries" (
    "dedupe_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "token" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "platform" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "device_token" "text"
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


COMMENT ON COLUMN "public"."push_tokens"."device_token" IS 'Raw FCM registration token (Android only). Null on iOS, which delivers via Expo/APNs.';



CREATE TABLE IF NOT EXISTS "public"."verification_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "member_id" "text" NOT NULL,
    "position" "text" DEFAULT 'Member'::"text" NOT NULL,
    "status" "public"."verification_status" DEFAULT 'AWAITING_CLUB_VALIDATION'::"public"."verification_status" NOT NULL,
    "proof_url" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text" DEFAULT ''::"text"
);


ALTER TABLE "public"."verification_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "zone_number" integer NOT NULL,
    "zone_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."zones" REPLICA IDENTITY FULL;


ALTER TABLE "public"."zones" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_club_code_key" UNIQUE ("club_code");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_states"
    ADD CONSTRAINT "conversation_states_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_impacts"
    ADD CONSTRAINT "event_impacts_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."event_invitations"
    ADD CONSTRAINT "event_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_event_id_user_id_key" UNIQUE ("event_id", "user_id");



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_participating_clubs"
    ADD CONSTRAINT "event_participating_clubs_pkey" PRIMARY KEY ("event_id", "club_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_deletions"
    ADD CONSTRAINT "message_deletions_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("dedupe_key");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."verification_applications"
    ADD CONSTRAINT "verification_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_zone_number_key" UNIQUE ("zone_number");



CREATE INDEX "idx_conversation_states_user" ON "public"."conversation_states" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_users" ON "public"."conversations" USING "btree" ("participant_user_id", "organizer_user_id");



CREATE INDEX "idx_direct_messages_conversation" ON "public"."direct_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_direct_messages_mentions" ON "public"."direct_messages" USING "gin" ("mentioned_user_ids");



CREATE INDEX "idx_events_organizing_club" ON "public"."events" USING "btree" ("organizing_club_id");



CREATE INDEX "idx_events_start_datetime" ON "public"."events" USING "btree" ("start_datetime");



CREATE INDEX "idx_events_status" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_message_deletions_user" ON "public"."message_deletions" USING "btree" ("user_id");



CREATE INDEX "idx_message_reads_conversation" ON "public"."message_reads" USING "btree" ("conversation_id");



CREATE INDEX "idx_notifications_created_by" ON "public"."notifications" USING "btree" ("created_by", "created_at");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_participants_event" ON "public"."event_participants" USING "btree" ("event_id");



CREATE INDEX "idx_participants_user" ON "public"."event_participants" USING "btree" ("user_id");



CREATE INDEX "idx_push_deliveries_created" ON "public"."push_deliveries" USING "btree" ("created_at");



CREATE INDEX "idx_push_tokens_device" ON "public"."push_tokens" USING "btree" ("device_token");



CREATE INDEX "idx_push_tokens_user" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE UNIQUE INDEX "uniq_group_conversation_per_event" ON "public"."conversations" USING "btree" ("event_id") WHERE "is_group";



CREATE UNIQUE INDEX "uniq_pending_invitation" ON "public"."event_invitations" USING "btree" ("event_id", "invited_user_id") WHERE ("status" = 'PENDING'::"public"."invitation_status");



CREATE OR REPLACE TRIGGER "trg_guard_invitation_update" BEFORE UPDATE ON "public"."event_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."guard_invitation_update"();



CREATE OR REPLACE TRIGGER "trg_guard_verification_application_update" BEFORE UPDATE ON "public"."verification_applications" FOR EACH ROW EXECUTE FUNCTION "public"."guard_verification_application_update"();



CREATE OR REPLACE TRIGGER "trg_notification_rate_limit" BEFORE INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_notification_rate_limit"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."verification_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_states"
    ADD CONSTRAINT "conversation_states_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_states"
    ADD CONSTRAINT "conversation_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_participant_user_id_fkey" FOREIGN KEY ("participant_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_impacts"
    ADD CONSTRAINT "event_impacts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_invitations"
    ADD CONSTRAINT "event_invitations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_invitations"
    ADD CONSTRAINT "event_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_invitations"
    ADD CONSTRAINT "event_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participants"
    ADD CONSTRAINT "event_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participating_clubs"
    ADD CONSTRAINT "event_participating_clubs_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_participating_clubs"
    ADD CONSTRAINT "event_participating_clubs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_organizing_club_id_fkey" FOREIGN KEY ("organizing_club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "fk_clubs_president" FOREIGN KEY ("president_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "fk_notif_conversation" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_deletions"
    ADD CONSTRAINT "message_deletions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."direct_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_deletions"
    ADD CONSTRAINT "message_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."verification_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_applications"
    ADD CONSTRAINT "verification_applications_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_applications"
    ADD CONSTRAINT "verification_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Applications insertable by applicant" ON "public"."verification_applications" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Applications updatable by reviewers" ON "public"."verification_applications" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['APP_ADMIN'::"public"."user_role", 'DISTRICT_ADMIN'::"public"."user_role"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'CLUB_PRESIDENT'::"public"."user_role") AND ("p"."club_id" = "verification_applications"."club_id"))))));



CREATE POLICY "Applications viewable by relevant users" ON "public"."verification_applications" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['APP_ADMIN'::"public"."user_role", 'DISTRICT_ADMIN'::"public"."user_role"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'CLUB_PRESIDENT'::"public"."user_role") AND ("p"."club_id" = "verification_applications"."club_id"))))));



CREATE POLICY "Audit logs insertable by reviewers" ON "public"."audit_logs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['APP_ADMIN'::"public"."user_role", 'DISTRICT_ADMIN'::"public"."user_role", 'CLUB_PRESIDENT'::"public"."user_role"]))))));



CREATE POLICY "Audit logs viewable by admins and club presidents" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['APP_ADMIN'::"public"."user_role", 'DISTRICT_ADMIN'::"public"."user_role", 'CLUB_PRESIDENT'::"public"."user_role"]))))));



CREATE POLICY "Clubs are viewable by everyone" ON "public"."clubs" FOR SELECT USING (true);



CREATE POLICY "Clubs insertable by district and app admins" ON "public"."clubs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['DISTRICT_ADMIN'::"public"."user_role", 'APP_ADMIN'::"public"."user_role"]))))));



CREATE POLICY "Conversations insertable by participants" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK ((((NOT "is_group") AND (("auth"."uid"() = "participant_user_id") OR ("auth"."uid"() = "organizer_user_id")) AND ( SELECT COALESCE("bool_and"("checks"."ok"), true) AS "coalesce"
   FROM ( SELECT ("p"."allow_direct_inquiries" OR ("p"."id" = "auth"."uid"()) OR (NOT ("p"."club_id" IS DISTINCT FROM ( SELECT "profiles"."club_id"
                   FROM "public"."profiles"
                  WHERE ("profiles"."id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
                   FROM "public"."profiles" "me"
                  WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = ANY (ARRAY['DISTRICT_ADMIN'::"public"."user_role", 'APP_ADMIN'::"public"."user_role"])))))) AS "ok"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = ANY (ARRAY["conversations"."participant_user_id", "conversations"."organizer_user_id"]))) "checks")) OR ("is_group" AND ("participant_user_id" IS NULL) AND (("auth"."uid"() = "organizer_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."event_participants" "ep"
  WHERE (("ep"."event_id" = "conversations"."event_id") AND ("ep"."user_id" = "auth"."uid"()) AND ("ep"."status" = 'JOINED'::"public"."participation_status"))))))));



CREATE POLICY "Conversations updatable by participants" ON "public"."conversations" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "participant_user_id") OR ("auth"."uid"() = "organizer_user_id") OR ("is_group" AND (EXISTS ( SELECT 1
   FROM "public"."event_participants" "ep"
  WHERE (("ep"."event_id" = "conversations"."event_id") AND ("ep"."user_id" = "auth"."uid"()) AND ("ep"."status" = 'JOINED'::"public"."participation_status")))))));



CREATE POLICY "Conversations viewable by participants" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "participant_user_id") OR ("auth"."uid"() = "organizer_user_id") OR ("is_group" AND (EXISTS ( SELECT 1
   FROM "public"."event_participants" "ep"
  WHERE (("ep"."event_id" = "conversations"."event_id") AND ("ep"."user_id" = "auth"."uid"()) AND ("ep"."status" = 'JOINED'::"public"."participation_status")))))));



CREATE POLICY "Events insertable by members" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "organizer_user_id"));



CREATE POLICY "Events updatable by organizers or presidents" ON "public"."events" FOR UPDATE TO "authenticated" USING ((("status" <> ALL (ARRAY['COMPLETED'::"public"."event_status", 'CANCELLED'::"public"."event_status"])) AND (("auth"."uid"() = "organizer_user_id") OR ("auth"."uid"() = ANY ("co_organizer_user_ids")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = ANY (ARRAY['DISTRICT_ADMIN'::"public"."user_role", 'APP_ADMIN'::"public"."user_role"])) OR (("p"."role" = 'CLUB_PRESIDENT'::"public"."user_role") AND ("p"."club_id" = "events"."organizing_club_id")))))))));



CREATE POLICY "Events viewable by authenticated users" ON "public"."events" FOR SELECT TO "authenticated" USING ((("status" <> ALL (ARRAY['PENDING_APPROVAL'::"public"."event_status", 'DRAFT'::"public"."event_status"])) OR ("auth"."uid"() = "organizer_user_id") OR ("auth"."uid"() = ANY ("co_organizer_user_ids")) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = ANY (ARRAY['DISTRICT_ADMIN'::"public"."user_role", 'APP_ADMIN'::"public"."user_role"])) OR (("events"."status" = 'PENDING_APPROVAL'::"public"."event_status") AND ("events"."event_type" <> 'DISTRICT_EVENT'::"public"."event_type") AND ("p"."role" = 'CLUB_PRESIDENT'::"public"."user_role") AND ("p"."club_id" = ANY ("public"."event_approver_club_ids"("events".*))))))))));



CREATE POLICY "Impacts insertable by organizing team" ON "public"."event_impacts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_impacts"."event_id") AND (("e"."organizer_user_id" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("e"."co_organizer_user_ids")))))));



CREATE POLICY "Impacts updatable by organizing team" ON "public"."event_impacts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_impacts"."event_id") AND (("e"."organizer_user_id" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("e"."co_organizer_user_ids")))))));



CREATE POLICY "Impacts viewable by authenticated" ON "public"."event_impacts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Invitations insertable by inviters" ON "public"."event_invitations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "invited_by_user_id"));



CREATE POLICY "Invitations updatable by invitee" ON "public"."event_invitations" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "invited_user_id"));



CREATE POLICY "Invitations viewable by participants" ON "public"."event_invitations" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "invited_user_id") OR ("auth"."uid"() = "invited_by_user_id")));



CREATE POLICY "Messages insertable respecting inquiry setting" ON "public"."direct_messages" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "direct_messages"."conversation_id") AND (("auth"."uid"() = "c"."organizer_user_id") OR ("auth"."uid"() = "c"."participant_user_id") OR ("c"."is_group" AND (EXISTS ( SELECT 1
           FROM "public"."event_participants" "ep"
          WHERE (("ep"."event_id" = "c"."event_id") AND ("ep"."user_id" = "auth"."uid"()) AND ("ep"."status" = 'JOINED'::"public"."participation_status"))))))))) AND (("receiver_id" IS NULL) OR ("receiver_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "target"
  WHERE (("target"."id" = "direct_messages"."receiver_id") AND ("target"."allow_direct_inquiries" OR (NOT ("target"."club_id" IS DISTINCT FROM ( SELECT "profiles"."club_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "me"
          WHERE (("me"."id" = "auth"."uid"()) AND ("me"."role" = ANY (ARRAY['DISTRICT_ADMIN'::"public"."user_role", 'APP_ADMIN'::"public"."user_role"]))))))))))));



CREATE POLICY "Messages viewable by conversation participants" ON "public"."direct_messages" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id") OR (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "direct_messages"."conversation_id") AND "c"."is_group" AND (("c"."organizer_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."event_participants" "ep"
          WHERE (("ep"."event_id" = "c"."event_id") AND ("ep"."user_id" = "auth"."uid"()) AND ("ep"."status" = 'JOINED'::"public"."participation_status"))))))))));



CREATE POLICY "Notifications deletable by recipient" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Notifications insertable with attributable creator" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "Notifications updatable by recipient" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Notifications viewable by recipient" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Own conversation state is visible" ON "public"."conversation_states" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Own message deletions are visible" ON "public"."message_deletions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Own push tokens are visible" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Participants deletable by self or organizing team" ON "public"."event_participants" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_participants"."event_id") AND (("e"."organizer_user_id" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("e"."co_organizer_user_ids"))))))));



CREATE POLICY "Participants insertable by self or organizing team" ON "public"."event_participants" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_participants"."event_id") AND (("e"."organizer_user_id" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("e"."co_organizer_user_ids")))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['DISTRICT_ADMIN'::"public"."user_role", 'APP_ADMIN'::"public"."user_role"])))))));



CREATE POLICY "Participants updatable by self or organizing team" ON "public"."event_participants" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_participants"."event_id") AND (("e"."organizer_user_id" = "auth"."uid"()) OR ("auth"."uid"() = ANY ("e"."co_organizer_user_ids"))))))));



CREATE POLICY "Participants viewable by authenticated users" ON "public"."event_participants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Participating clubs deletable by organizer" ON "public"."event_participating_clubs" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_participating_clubs"."event_id") AND ("e"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Participating clubs insertable by organizer" ON "public"."event_participating_clubs" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."events" "e"
  WHERE (("e"."id" = "event_participating_clubs"."event_id") AND ("e"."organizer_user_id" = "auth"."uid"())))));



CREATE POLICY "Participating clubs viewable by all" ON "public"."event_participating_clubs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Profiles are viewable by authenticated users" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Read cursors visible to conversation members" ON "public"."message_reads" FOR SELECT TO "authenticated" USING ("public"."is_conversation_member"("conversation_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can undo their own hide" ON "public"."message_deletions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users clear their own conversation state" ON "public"."conversation_states" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users hide messages for themselves" ON "public"."message_deletions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users register their own push token" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users remove their own push token" ON "public"."push_tokens" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users set their own conversation state" ON "public"."conversation_states" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their own conversation state" ON "public"."conversation_states" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their own push token" ON "public"."push_tokens" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their own read cursor" ON "public"."message_reads" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users upsert their own read cursor" ON "public"."message_reads" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_conversation_member"("conversation_id")));



CREATE POLICY "Zones are viewable by everyone" ON "public"."zones" FOR SELECT USING (true);



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."direct_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_impacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_participating_clubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_deletions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verification_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zones" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."audit_logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."clubs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversation_states";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."direct_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."event_impacts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."event_invitations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."event_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."event_participating_clubs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_deletions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."verification_applications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."zones";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_user_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."admin_set_role"("p_user_id" "uuid", "p_role" "text", "p_system_role" "text", "p_club_role" "text", "p_position" "text") TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."events" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."events" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."events" TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_event"("p_event_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."create_event_with_clubs"("p_event" "jsonb", "p_participating_club_ids" "uuid"[]) TO "authenticated";



GRANT ALL ON FUNCTION "public"."email_for_username"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."email_for_username"("p_username" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."is_conversation_member"("p_conv" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."review_application"("p_app_id" "uuid", "p_action" "text", "p_notes" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."send_event_broadcast"("p_event_id" "uuid", "p_title" "text", "p_message" "text", "p_priority" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."unsend_message"("p_message_id" "uuid") TO "authenticated";
























GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."audit_logs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."audit_logs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."audit_logs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."clubs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."clubs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."clubs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."conversation_states" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."conversation_states" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."conversation_states" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."conversations" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."conversations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."conversations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."direct_messages" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."direct_messages" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."direct_messages" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_impacts" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_impacts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_impacts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_invitations" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_invitations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_invitations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_participants" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_participants" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_participants" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_participating_clubs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_participating_clubs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."event_participating_clubs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."message_deletions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."message_deletions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."message_deletions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."message_reads" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."message_reads" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."message_reads" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."notifications" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."notifications" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."notifications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."profiles" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."push_deliveries" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."push_deliveries" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."push_deliveries" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."push_tokens" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."push_tokens" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."push_tokens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."verification_applications" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."verification_applications" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."verification_applications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."zones" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."zones" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."zones" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE POLICY "Applicants delete their own proof" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'verification-proofs'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Applicants manage their own proof" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'verification-proofs'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Applicants upload their own proof" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'verification-proofs'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "Avatars are publicly readable" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'avatars'::"text"));



CREATE POLICY "Chat media readable by conversation members" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'chat-media'::"text") AND "public"."is_conversation_member"((("storage"."foldername"("name"))[1])::"uuid")));



CREATE POLICY "Chat media uploadable by conversation members" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'chat-media'::"text") AND (("storage"."foldername"("name"))[2] = ("auth"."uid"())::"text") AND "public"."is_conversation_member"((("storage"."foldername"("name"))[1])::"uuid")));



CREATE POLICY "Event covers are publicly readable" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'event-covers'::"text"));



CREATE POLICY "Members can replace event covers" ON "storage"."objects" FOR UPDATE TO "authenticated" USING (("bucket_id" = 'event-covers'::"text"));



CREATE POLICY "Members can upload event covers" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'event-covers'::"text"));



CREATE POLICY "Proofs readable by owner and reviewers" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'verification-proofs'::"text") AND ((("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['APP_ADMIN'::"public"."user_role", 'DISTRICT_ADMIN'::"public"."user_role"]))))) OR (EXISTS ( SELECT 1
   FROM ("public"."verification_applications" "va"
     JOIN "public"."profiles" "reviewer" ON (("reviewer"."id" = "auth"."uid"())))
  WHERE ((("va"."user_id")::"text" = ("storage"."foldername"("objects"."name"))[1]) AND ("reviewer"."role" = 'CLUB_PRESIDENT'::"public"."user_role") AND ("reviewer"."club_id" = "va"."club_id")))))));



CREATE POLICY "Users manage their own avatar" ON "storage"."objects" TO "authenticated" USING ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text"))) WITH CHECK ((("bucket_id" = 'avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));





-- >>> Migration: supabase/migrations/0028_conversation_state_muted.sql >>>
SET search_path = public, extensions, auth, storage;

-- ============================================================================
-- 0028 — Add muted flag to conversation_states
-- ============================================================================
-- Allows users to mute individual conversations (group chats or DMs).
-- Muted conversations suppress standard push notifications while still
-- allowing direct @mentions and urgent organizer alerts to pierce through.

ALTER TABLE conversation_states
  ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT false;


-- >>> Migration: supabase/migrations/0029_message_reactions_and_replies.sql >>>
SET search_path = public, extensions, auth, storage;

-- ============================================================================
-- 0029 — Message Reactions & Reply Threads
-- ============================================================================
-- Adds support for emoji reactions on messages (1 active reaction per user per message)
-- and message quoting / replies.

-- 1. Message Reactions Table
CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_message_user_reaction UNIQUE (message_id, user_id)
);

-- Index for fast lookup by message
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id);

ALTER TABLE message_reactions REPLICA IDENTITY FULL;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for message_reactions
DROP POLICY IF EXISTS "Reactions are viewable by everyone who can view the message" ON message_reactions;
CREATE POLICY "Reactions are viewable by everyone who can view the message"
  ON message_reactions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can insert their own reactions" ON message_reactions;
CREATE POLICY "Users can insert their own reactions"
  ON message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reactions" ON message_reactions;
CREATE POLICY "Users can update their own reactions"
  ON message_reactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reactions" ON message_reactions;
CREATE POLICY "Users can delete their own reactions"
  ON message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Add reply fields to direct_messages
ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID,
  ADD COLUMN IF NOT EXISTS reply_to_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_text TEXT;

-- 3. Add message_reactions to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
END $$;


-- >>> Migration: supabase/migrations/0030_location_and_geofence_enhancements.sql >>>
SET search_path = public, extensions, auth, storage;

-- Migration 0030: Add columns for Event Geofence Radius, Periodic Location Sync, and Club Contact Details

-- 1. Add geofence_radius_meters to events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS geofence_radius_meters INTEGER DEFAULT 300;

-- 2. Add periodic background location columns and official digital signature to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- 3. Add contact and meeting place columns to clubs
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS meeting_address TEXT;


-- >>> Migration: supabase/migrations/0031_add_emergency_broadcast_to_notification_kind.sql >>>
SET search_path = public, extensions, auth, storage;

-- Add EMERGENCY_BROADCAST and EMERGENCY_SOS to notification_kind enum if not present
-- [Enum already created upfront]


-- >>> Migration: supabase/migrations/0032_generalize_audit_logs.sql >>>
SET search_path = public, extensions, auth, storage;

-- Migration 0032: Generalize audit_logs beyond verification applications.
--
-- audit_logs was created for ONE purpose: recording verification-application
-- reviews. The app has since grown a general-purpose audit trail (see
-- AuditLogsScreen and the AuditLog type) that also records ROLE changes, EVENT
-- approvals/cancellations and ATTENDANCE marking. Those writes fail today:
-- PostgREST rejects the unknown `category` column first, and even with it added
-- the NOT NULL application_id and the verification_status-typed status columns
-- would reject every non-verification row.
--
-- All changes are additive or constraint-relaxing; no existing row is altered.

-- 1. Columns the AuditLog type already sends.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_name TEXT;

-- 2. Only VERIFICATION rows have an application; ROLE/EVENT/ATTENDANCE do not.
ALTER TABLE public.audit_logs
  ALTER COLUMN application_id DROP NOT NULL;

-- 3. previous_status/new_status were typed `verification_status`, but the other
--    categories record event statuses ('CANCELLED'), positions ('Member') and
--    attendance states ('ATTENDED') — none of which are enum members. Widen to
--    TEXT; existing enum values cast cleanly and the review_application RPCs
--    keep working via the enum -> text assignment cast.
ALTER TABLE public.audit_logs
  ALTER COLUMN previous_status TYPE TEXT USING previous_status::text,
  ALTER COLUMN new_status      TYPE TEXT USING new_status::text;

-- 4. The app treats both as optional on the AuditLog type.
ALTER TABLE public.audit_logs
  ALTER COLUMN previous_status DROP NOT NULL,
  ALTER COLUMN new_status      DROP NOT NULL;

-- 5. Constrain category to the values the client actually emits.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_category_check'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_category_check
      CHECK (category IS NULL OR category IN ('ROLE', 'EVENT', 'VERIFICATION', 'ATTENDANCE', 'SYSTEM'));
  END IF;
END $$;

-- 6. AuditLogsScreen filters by category and lists newest-first.
CREATE INDEX IF NOT EXISTS idx_audit_logs_category_created_at
  ON public.audit_logs (category, created_at DESC);


-- >>> Migration: supabase/migrations/0033_fix_events_update_with_check.sql >>>
SET search_path = public, extensions, auth, storage;

-- Migration 0033: Allow events to be CANCELLED / COMPLETED.
--
-- The UPDATE policy was written with a USING clause and no WITH CHECK:
--
--   USING (status NOT IN ('COMPLETED','CANCELLED') AND <authorized>)
--
-- When WITH CHECK is omitted, PostgreSQL reuses USING for it, so the NEW row was
-- also required to satisfy `status NOT IN ('COMPLETED','CANCELLED')`. The guard
-- is correct for the OLD row (you may not edit a finished event) but applied to
-- the new row it makes the CANCELLED/COMPLETED transitions unreachable:
--   "new row violates row-level security policy for table events".
--
-- Approving an event was unaffected only because it goes through the
-- approve_event() SECURITY DEFINER RPC (migration 0020), which bypasses RLS.
--
-- Fix: keep the guard in USING, and give WITH CHECK the authorization test ALONE
-- so a permitted actor may move an event into a terminal state. Authorization is
-- unchanged — this does not widen who can edit an event.

DROP POLICY IF EXISTS "Events updatable by organizers or presidents" ON public.events;

CREATE POLICY "Events updatable by organizers or presidents" ON public.events
  FOR UPDATE TO authenticated
  -- OLD row: a finished event stays frozen.
  USING (
    status NOT IN ('COMPLETED', 'CANCELLED')
    AND (
      auth.uid() = organizer_user_id
      OR auth.uid() = ANY(co_organizer_user_ids)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            p.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
            OR (p.role = 'CLUB_PRESIDENT' AND p.club_id = organizing_club_id)
          )
      )
    )
  )
  -- NEW row: authorization only, so CANCELLED/COMPLETED are reachable.
  WITH CHECK (
    auth.uid() = organizer_user_id
    OR auth.uid() = ANY(co_organizer_user_ids)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
          OR (p.role = 'CLUB_PRESIDENT' AND p.club_id = organizing_club_id)
        )
    )
  );


-- >>> Migration: supabase/migrations/0034_district_review_escalation.sql >>>
SET search_path = public, extensions, auth, storage;

-- Migration 0034: Persist the "escalate to District Admin" request.
--
-- requestDistrictEventReview only ever sent notifications: nothing about the event
-- changed, so a District Admin who tapped the notification had no Approve button
-- (canApproveEvent requires CLUB_PRESIDENT for club events) and no way to tell an
-- escalated event from any other. The screen's own "Review Requested" state was
-- local component state that vanished on remount.
--
-- Recording it on the event makes the escalation durable, visible to every admin,
-- and usable as the condition that unlocks approval.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS district_review_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS district_review_requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Admin queues list escalated events newest-first; partial index because escalation
-- is rare relative to the table.
CREATE INDEX IF NOT EXISTS idx_events_district_review_requested
  ON public.events (district_review_requested_at DESC)
  WHERE district_review_requested_at IS NOT NULL;


-- >>> Migration: supabase/migrations/0035_district_area_admin_role.sql >>>
SET search_path = public, extensions, auth, storage;

-- Migration 0035: District Area Admin — a District Admin scoped to one Zone.
--
-- Same powers as a District Admin (event approval, application review, role
-- management) but only over clubs in their own Zone. The Zone is derived from
-- their club's zone_id rather than a new profiles.zone_id column, so an area
-- admin governs the Zone their club belongs to.
--
-- NOT granted: signing the District Rotaract Representative line on certificates.
-- That signature represents the District as a whole and stays with DISTRICT_ADMIN.
--
-- NOTE: adding an enum value is NOT reversible — Postgres has no DROP VALUE. The
-- value can also not be used in the same transaction that adds it, which is why
-- nothing here inserts or compares against it.

-- [Enum already created upfront]

-- system_role is a TEXT column with a CHECK, so it just needs widening.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_system_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_system_role_check
  CHECK (system_role IN ('APP_ADMIN', 'DISTRICT_ADMIN', 'DISTRICT_AREA_ADMIN', 'NONE'));


-- >>> Migration: supabase/migrations/0036_area_admin_governs_club.sql >>>
SET search_path = public, extensions, auth, storage;

-- Migration 0036: Teach the database about District Area Admins.
--
-- 0035 added the role; without this the client would offer an Area Admin every
-- District Admin action and the database would reject each one, because every
-- policy tests `role IN ('DISTRICT_ADMIN','APP_ADMIN')` literally.
--
-- governs_club() is the SQL twin of canGovernClub() in src/utils/roles.ts — keep
-- the two in step. It fails CLOSED: an Area Admin whose Zone cannot be resolved
-- (no club, or a club with no zone_id) governs nothing.
--
-- Runs in a separate migration from the ALTER TYPE that created the enum value:
-- Postgres forbids using a new enum value in the transaction that adds it.

CREATE OR REPLACE FUNCTION public.governs_club(p_user UUID, p_club UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- Events may be edited by an Area Admin governing the organizing club. Mirrors 0033
-- (guard in USING, authorization-only in WITH CHECK so terminal states stay reachable).
DROP POLICY IF EXISTS "Events updatable by organizers or presidents" ON public.events;

CREATE POLICY "Events updatable by organizers or presidents" ON public.events
  FOR UPDATE TO authenticated
  USING (
    status NOT IN ('COMPLETED', 'CANCELLED')
    AND (
      auth.uid() = organizer_user_id
      OR auth.uid() = ANY(co_organizer_user_ids)
      OR public.governs_club(auth.uid(), organizing_club_id)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'CLUB_PRESIDENT'
          AND p.club_id = organizing_club_id
      )
    )
  )
  WITH CHECK (
    auth.uid() = organizer_user_id
    OR auth.uid() = ANY(co_organizer_user_ids)
    OR public.governs_club(auth.uid(), organizing_club_id)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'CLUB_PRESIDENT'
        AND p.club_id = organizing_club_id
    )
  );

-- approve_event: let a District Area Admin unblock a stalled approval for a club in
-- their Zone. Body is 0020's, with the admin branch widened via governs_club().
CREATE OR REPLACE FUNCTION approve_event(p_event_id UUID)
RETURNS events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

GRANT EXECUTE ON FUNCTION approve_event(UUID) TO authenticated;


-- >>> Migration: supabase/migrations/0037_admin_set_role_area_admin.sql >>>
SET search_path = public, extensions, auth, storage;

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


-- >>> Migration: supabase/migrations/0038_admin_set_role_restore_presidency_sync.sql >>>
SET search_path = public, extensions, auth, storage;

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


-- >>> Migration: supabase/migrations/0039_fix_attendance_checkin_rls.sql >>>
SET search_path = public, extensions, auth, storage;

-- Migration 0039: Fix Attendance Check-In & Check-Out RLS & Enum
-- Allows ORGANIZER_QR check-in method and expands RLS UPDATE policy to Club Presidents and District/App Admins.

-- 1. Add ORGANIZER_QR to check_in_method enum if not present
-- [Enum already created upfront]

-- 2. Drop existing restrictive UPDATE policy on event_participants
DROP POLICY IF EXISTS "Participants updatable by self or organizing team" ON public.event_participants;

-- 3. Re-create comprehensive UPDATE policy on event_participants
CREATE POLICY "Participants updatable by self or organizing team" ON public.event_participants
FOR UPDATE TO authenticated
USING (
  -- Self attendee
  (auth.uid() = user_id)
  OR
  -- Event creator or co-organizers
  (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_participants.event_id
      AND (
        e.organizer_user_id = auth.uid()
        OR auth.uid() = ANY (e.co_organizer_user_ids)
      )
  ))
  OR
  -- District Admin or App Admin
  (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = ANY (ARRAY['DISTRICT_ADMIN'::public.user_role, 'APP_ADMIN'::public.user_role])
  ))
  OR
  -- Club President of organizing club
  (EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.events e ON e.id = event_participants.event_id
    WHERE p.id = auth.uid()
      AND p.role = 'CLUB_PRESIDENT'::public.user_role
      AND p.club_id = e.organizing_club_id
  ))
  OR
  -- Club President of partner participating club
  (EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.event_participating_clubs epc ON epc.event_id = event_participants.event_id
    WHERE p.id = auth.uid()
      AND p.role = 'CLUB_PRESIDENT'::public.user_role
      AND p.club_id = epc.club_id
  ))
);

-- 4. Create security-definer RPC function for atomic attendance recording
CREATE OR REPLACE FUNCTION public.record_event_attendance(
  p_participant_id uuid,
  p_attendance_status public.attendance_status DEFAULT NULL,
  p_checked_in_at timestamptz DEFAULT NULL,
  p_check_in_lat float8 DEFAULT NULL,
  p_check_in_lng float8 DEFAULT NULL,
  p_check_in_dist int4 DEFAULT NULL,
  p_check_in_method text DEFAULT NULL,
  p_checked_out_at timestamptz DEFAULT NULL,
  p_check_out_lat float8 DEFAULT NULL,
  p_check_out_lng float8 DEFAULT NULL,
  p_check_out_dist int4 DEFAULT NULL,
  p_check_out_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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


-- >>> Migration: supabase/migrations/0040_fix_push_tokens_grants.sql >>>
SET search_path = public, extensions, auth, storage;

-- Fix: grant DML privileges on push tables to the authenticated role.
-- The original migration (0027) only granted REFERENCES/TRIGGER/TRUNCATE/
-- omitting SELECT/INSERT/UPDATE/DELETE, which caused the RLS WITH CHECK to fail
-- with "42501 insufficient_privilege" even though the RLS policy itself was correct.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_deliveries   TO authenticated;

-- service_role already bypasses RLS, but grant explicitly for clarity.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_tokens       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_deliveries   TO service_role;


-- >>> Migration: supabase/migrations/0041_club_participant_allocation.sql >>>
SET search_path = public, extensions, auth, storage;

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


-- >>> Migration: supabase/migrations/0042_add_gender_pronouns_to_profiles.sql >>>
SET search_path = public, extensions, auth, storage;

-- Add gender/pronouns column to public.profiles for certificate generation and profile customization
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT;


-- >>> Migration: supabase/migrations/0043_cohosting_mvp.sql >>>
SET search_path = public, extensions, auth, storage;

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


-- >>> Migration: supabase/migrations/0044_fix_cohosting_rpc_casts.sql >>>
SET search_path = public, extensions, auth, storage;

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


-- >>> Migration: supabase/migrations/0046_add_certificate_ready_to_notification_kind.sql >>>
SET search_path = public, extensions, auth, storage;

-- Add CERTIFICATE_READY to notification_kind enum if not present
-- [Enum already created upfront]


-- >>> SEED DATA >>>
SET search_path = public, extensions, auth, storage;

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
