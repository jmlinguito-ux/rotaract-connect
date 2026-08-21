-- Migration 0028: Fix Attendance Check-In & Check-Out RLS & Enum
-- Allows ORGANIZER_QR check-in method and expands RLS UPDATE policy to Club Presidents and District/App Admins.

-- 1. Add ORGANIZER_QR to check_in_method enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type typ
    JOIN pg_enum enm ON enm.enumtypid = typ.oid
    WHERE typ.typname = 'check_in_method' AND enm.enumlabel = 'ORGANIZER_QR'
  ) THEN
    ALTER TYPE "public"."check_in_method" ADD VALUE 'ORGANIZER_QR';
  END IF;
END $$;

-- 2. Drop existing restrictive UPDATE policy on event_participants
DROP POLICY IF EXISTS "Participants updatable by self or organizing team" ON "public"."event_participants";

-- 3. Re-create comprehensive UPDATE policy on event_participants
CREATE POLICY "Participants updatable by self or organizing team" ON "public"."event_participants"
FOR UPDATE TO "authenticated"
USING (
  -- Self attendee
  ("auth"."uid"() = "user_id")
  OR
  -- Event creator or co-organizers
  (EXISTS (
    SELECT 1 FROM "public"."events" "e"
    WHERE "e"."id" = "event_participants"."event_id"
      AND (
        "e"."organizer_user_id" = "auth"."uid"()
        OR "auth"."uid"() = ANY ("e"."co_organizer_user_ids")
      )
  ))
  OR
  -- District Admin or App Admin
  (EXISTS (
    SELECT 1 FROM "public"."profiles" "p"
    WHERE "p"."id" = "auth"."uid"()
      AND "p"."role" = ANY (ARRAY['DISTRICT_ADMIN'::"public"."user_role", 'APP_ADMIN'::"public"."user_role"])
  ))
  OR
  -- Club President of organizing club
  (EXISTS (
    SELECT 1 FROM "public"."profiles" "p"
    JOIN "public"."events" "e" ON "e"."id" = "event_participants"."event_id"
    WHERE "p"."id" = "auth"."uid"()
      AND "p"."role" = 'CLUB_PRESIDENT'::"public"."user_role"
      AND "p"."club_id" = "e"."organizing_club_id"
  ))
  OR
  -- Club President of partner participating club
  (EXISTS (
    SELECT 1 FROM "public"."profiles" "p"
    JOIN "public"."event_participating_clubs" "epc" ON "epc"."event_id" = "event_participants"."event_id"
    WHERE "p"."id" = "auth"."uid"()
      AND "p"."role" = 'CLUB_PRESIDENT'::"public"."user_role"
      AND "p"."club_id" = "epc"."club_id"
  ))
);

-- 4. Create security-definer RPC function for atomic attendance recording
CREATE OR REPLACE FUNCTION "public"."record_event_attendance"(
  "p_participant_id" "uuid",
  "p_attendance_status" "public"."attendance_status" DEFAULT NULL,
  "p_checked_in_at" "timestamptz" DEFAULT NULL,
  "p_check_in_lat" "float8" DEFAULT NULL,
  "p_check_in_lng" "float8" DEFAULT NULL,
  "p_check_in_dist" "int4" DEFAULT NULL,
  "p_check_in_method" "text" DEFAULT NULL,
  "p_checked_out_at" "timestamptz" DEFAULT NULL,
  "p_check_out_lat" "float8" DEFAULT NULL,
  "p_check_out_lng" "float8" DEFAULT NULL,
  "p_check_out_dist" "int4" DEFAULT NULL,
  "p_check_out_method" "text" DEFAULT NULL
)
RETURNS "jsonb"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id "uuid";
  v_participant "public"."event_participants"%ROWTYPE;
  v_event "public"."events"%ROWTYPE;
  v_is_authorized "boolean" := false;
  v_caller_role "public"."user_role";
  v_caller_club "uuid";
  v_check_in_enum "public"."check_in_method";
BEGIN
  v_caller_id := "auth"."uid"();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_participant FROM "public"."event_participants" WHERE "id" = "p_participant_id";
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant not found');
  END IF;

  SELECT * INTO v_event FROM "public"."events" WHERE "id" = v_participant."event_id";
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  -- Check Authorization: self, event organizer, co-organizers, club president, district/app admin
  SELECT "role", "club_id" INTO v_caller_role, v_caller_club FROM "public"."profiles" WHERE "id" = v_caller_id;

  IF v_caller_id = v_participant."user_id" THEN
    v_is_authorized := true;
  ELSIF v_caller_id = v_event."organizer_user_id" OR v_caller_id = ANY(v_event."co_organizer_user_ids") THEN
    v_is_authorized := true;
  ELSIF v_caller_role IN ('DISTRICT_ADMIN', 'APP_ADMIN') THEN
    v_is_authorized := true;
  ELSIF v_caller_role = 'CLUB_PRESIDENT' AND (
    v_caller_club = v_event."organizing_club_id"
    OR EXISTS (SELECT 1 FROM "public"."event_participating_clubs" WHERE "event_id" = v_event."id" AND "club_id" = v_caller_club)
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized to modify attendance for this event');
  END IF;

  -- Parse check_in_method enum safely
  IF "p_check_in_method" IS NOT NULL THEN
    BEGIN
      v_check_in_enum := "p_check_in_method"::"public"."check_in_method";
    EXCEPTION WHEN OTHERS THEN
      v_check_in_enum := 'ORGANIZER'::"public"."check_in_method";
    END;
  END IF;

  -- Apply updates
  UPDATE "public"."event_participants"
  SET
    "attendance_status" = COALESCE("p_attendance_status", "attendance_status"),
    "checked_in_at" = COALESCE("p_checked_in_at", "checked_in_at"),
    "check_in_latitude" = COALESCE("p_check_in_lat", "check_in_latitude"),
    "check_in_longitude" = COALESCE("p_check_in_lng", "check_in_longitude"),
    "check_in_distance_m" = COALESCE("p_check_in_dist", "check_in_distance_m"),
    "check_in_method" = COALESCE(v_check_in_enum, "check_in_method"),
    "checked_out_at" = COALESCE("p_checked_out_at", "checked_out_at"),
    "check_out_latitude" = COALESCE("p_check_out_lat", "check_out_latitude"),
    "check_out_longitude" = COALESCE("p_check_out_lng", "check_out_longitude"),
    "check_out_distance_m" = COALESCE("p_check_out_dist", "check_out_distance_m"),
    "check_out_method" = COALESCE("p_check_out_method", "check_out_method")
  WHERE "id" = "p_participant_id";

  RETURN jsonb_build_object('success', true);
END;
$$;
