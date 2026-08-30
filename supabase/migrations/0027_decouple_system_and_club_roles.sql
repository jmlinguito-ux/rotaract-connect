


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


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






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
    'ORGANIZER'
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
    'INQUIRY_RECEIVED'
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
    'APP_ADMIN'
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



