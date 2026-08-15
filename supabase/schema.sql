-- ========================================================
-- ROTARACT CONNECT — SUPABASE POSTGRESQL DATABASE SCHEMA
-- ========================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. ENUM TYPES
-- ==========================================

CREATE TYPE user_role AS ENUM (
  'MEMBER',
  'CLUB_PRESIDENT',
  'DISTRICT_ADMIN',
  'APP_ADMIN'
);

CREATE TYPE verification_status AS ENUM (
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

CREATE TYPE event_type AS ENUM (
  'SERVICE_PROJECT',
  'FELLOWSHIP',
  'DISTRICT_EVENT'
);

CREATE TYPE event_status AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'PUBLISHED',
  'RECRUITING',
  'SCHEDULED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE event_visibility AS ENUM (
  'VERIFIED_ROTARACTORS',
  'CLUB_ONLY',
  'INVITATION_ONLY'
);

CREATE TYPE area_of_focus AS ENUM (
  'PEACEBUILDING',
  'DISEASE_PREVENTION',
  'WATER_SANITATION',
  'MATERNAL_CHILD_HEALTH',
  'EDUCATION_LITERACY',
  'COMMUNITY_DEVELOPMENT',
  'ENVIRONMENT'
);

CREATE TYPE participation_status AS ENUM (
  'PENDING',
  'JOINED',
  'CANCELLED'
);

CREATE TYPE attendance_status AS ENUM (
  'NOT_MARKED',
  'ATTENDED',
  'ABSENT'
);

CREATE TYPE invitation_status AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED'
);

CREATE TYPE notification_kind AS ENUM (
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

-- Who produced a participant's check-in record.
CREATE TYPE check_in_method AS ENUM (
  'SELF_GPS',
  'ORGANIZER'
);

-- ==========================================
-- 2. TABLES
-- ==========================================

-- ZONES
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_number INT NOT NULL UNIQUE,
  zone_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CLUBS
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_name TEXT NOT NULL,
  club_code TEXT NOT NULL UNIQUE,
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  city TEXT NOT NULL,
  province TEXT NOT NULL DEFAULT 'Metro Manila',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  description TEXT DEFAULT '',
  -- Denormalized display counter. The app counts members live from profiles;
  -- keep this roughly in step (trigger or scheduled job) but never trust it.
  member_count INT NOT NULL DEFAULT 0,
  president_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PROFILES (Users linked to auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  position TEXT NOT NULL DEFAULT 'Member',
  role user_role NOT NULL DEFAULT 'MEMBER',
  verification_status verification_status NOT NULL DEFAULT 'PENDING',
  avatar_url TEXT,
  contact_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add Foreign Key constraint for club president after profiles table exists
ALTER TABLE clubs ADD CONSTRAINT fk_clubs_president FOREIGN KEY (president_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- EVENTS
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_type event_type NOT NULL,
  status event_status NOT NULL DEFAULT 'DRAFT',
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  organizing_club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  organizer_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Members co-running the event alongside the organizer.
  co_organizer_user_ids UUID[] NOT NULL DEFAULT '{}',
  -- Clubs whose President has already approved while status = 'PENDING_APPROVAL'.
  approved_by_club_ids UUID[] NOT NULL DEFAULT '{}',
  max_participants INT NOT NULL DEFAULT 50,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  allow_participant_invites BOOLEAN NOT NULL DEFAULT true,
  visibility event_visibility NOT NULL DEFAULT 'VERIFIED_ROTARACTORS',
  -- Cutoff window in hours before start_datetime when participants can no longer leave. Default: 24.
  lock_leave_cutoff_hours INT NOT NULL DEFAULT 24,
  cover_photo TEXT,
  contact_number TEXT,
  contact_email TEXT,
  areas_of_focus area_of_focus[] DEFAULT '{}',
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EVENT PARTICIPATING CLUBS (Junction Table)
CREATE TABLE event_participating_clubs (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, club_id)
);

-- EVENT PARTICIPANTS
CREATE TABLE event_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status participation_status NOT NULL DEFAULT 'PENDING',
  attendance_status attendance_status NOT NULL DEFAULT 'NOT_MARKED',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_at TIMESTAMPTZ,
  check_in_latitude DOUBLE PRECISION,
  check_in_longitude DOUBLE PRECISION,
  check_in_distance_m DOUBLE PRECISION,
  -- SELF_GPS = attendee's own verified GPS check-in; ORGANIZER = recorded by the
  -- organizing team (no GPS proof). Keeps manual records distinguishable in audits.
  check_in_method check_in_method NOT NULL DEFAULT 'SELF_GPS',
  UNIQUE(event_id, user_id)
);

-- EVENT INVITATIONS
CREATE TABLE event_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status invitation_status NOT NULL DEFAULT 'PENDING',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional note the invitee leaves when declining.
  decline_reason TEXT
);

-- EVENT IMPACTS
CREATE TABLE event_impacts (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  volunteer_hours INT NOT NULL DEFAULT 0,
  beneficiaries INT NOT NULL DEFAULT 0,
  funds_raised NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  items_distributed INT NOT NULL DEFAULT 0,
  trees_planted INT NOT NULL DEFAULT 0,
  impact_summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VERIFICATION APPLICATIONS
CREATE TABLE verification_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'Member',
  status verification_status NOT NULL DEFAULT 'AWAITING_CLUB_VALIDATION',
  proof_url TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT DEFAULT ''
);

-- AUDIT LOGS
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES verification_applications(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by_name TEXT NOT NULL,
  performed_by_role user_role NOT NULL,
  previous_status verification_status NOT NULL,
  new_status verification_status NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTIFICATIONS
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind notification_kind NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  application_id UUID REFERENCES verification_applications(id) ON DELETE CASCADE,
  conversation_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CONVERSATIONS
-- Supports both 1-on-1 (participant ↔ organizer) and group chats (is_group = true).
-- For group conversations participant_user_id is NULL; membership is inferred from
-- the event's joined participants list instead.
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  event_title TEXT,
  is_group BOOLEAN NOT NULL DEFAULT false,
  participant_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organizer_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DIRECT MESSAGES
CREATE TABLE direct_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- NULL for event group-chat messages, which reach every JOINED participant.
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign Key linking notification conversation_id
ALTER TABLE notifications ADD CONSTRAINT fk_notif_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- ==========================================
-- 3. INDEXES FOR PERFORMANCE
-- ==========================================

CREATE INDEX idx_events_organizing_club ON events(organizing_club_id);
CREATE INDEX idx_events_start_datetime ON events(start_datetime);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_participants_event ON event_participants(event_id);
CREATE INDEX idx_participants_user ON event_participants(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_direct_messages_conversation ON direct_messages(conversation_id, created_at);
CREATE INDEX idx_conversations_users ON conversations(participant_user_id, organizer_user_id);

-- One open invitation per user per event (a declined one may be re-sent).
CREATE UNIQUE INDEX uniq_pending_invitation ON event_invitations(event_id, invited_user_id) WHERE status = 'PENDING';
-- One group conversation per event.
CREATE UNIQUE INDEX uniq_group_conversation_per_event ON conversations(event_id) WHERE is_group;

-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participating_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Public Read for Zones and Clubs
CREATE POLICY "Zones are viewable by everyone" ON zones FOR SELECT USING (true);
CREATE POLICY "Clubs are viewable by everyone" ON clubs FOR SELECT USING (true);
-- District and App Admins register new clubs from the app.
CREATE POLICY "Clubs insertable by district and app admins" ON clubs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('DISTRICT_ADMIN', 'APP_ADMIN'))
);
CREATE POLICY "Profiles are viewable by authenticated users" ON profiles FOR SELECT TO authenticated USING (true);

-- Sign-in helper: resolve a username to its account email so users can log in
-- with either. SECURITY DEFINER because profiles blocks unauthenticated reads;
-- returns only the email for an exact (case-insensitive) username match.
CREATE OR REPLACE FUNCTION email_for_username(p_username TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM profiles WHERE lower(username) = lower(p_username) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION email_for_username(TEXT) TO anon, authenticated;
-- Registration: a new auth user creates exactly their own profile row.
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Events Policies
--
-- Clubs whose President must approve a pending event: the organizing club, the club
-- of every co-organizer, and every partner club. Mirrors approverClubIdsFor() in
-- src/utils/eventApproval.ts — keep the two in step.
CREATE OR REPLACE FUNCTION event_approver_club_ids(ev events)
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- Published events are open to all authenticated Rotaractors. Unpublished ones are
-- restricted to the organizing team, the Presidents who must approve them, and admins.
CREATE POLICY "Events viewable by authenticated users" ON events FOR SELECT TO authenticated USING (
  status NOT IN ('PENDING_APPROVAL', 'DRAFT')
  OR auth.uid() = organizer_user_id
  OR auth.uid() = ANY(co_organizer_user_ids)
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
        OR (
          status = 'PENDING_APPROVAL'
          AND event_type <> 'DISTRICT_EVENT'
          AND p.role = 'CLUB_PRESIDENT'
          AND p.club_id = ANY(event_approver_club_ids(events))
        )
      )
  )
);
CREATE POLICY "Events insertable by members" ON events FOR INSERT TO authenticated WITH CHECK (auth.uid() = organizer_user_id);
-- Editing is narrower than approving: the organizing team, the organizing club's
-- President, and admins. Presidents of co-organizing or partner clubs approve an
-- event but must not rewrite it. Mirrors eventEditPolicy() in
-- src/utils/eventEditPolicy.ts — keep the two in step.
CREATE POLICY "Events updatable by organizers or presidents" ON events FOR UPDATE TO authenticated USING (
  status NOT IN ('COMPLETED', 'CANCELLED')
  AND (
    auth.uid() = organizer_user_id
    OR auth.uid() = ANY(co_organizer_user_ids)
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('DISTRICT_ADMIN', 'APP_ADMIN')
          OR (p.role = 'CLUB_PRESIDENT' AND p.club_id = organizing_club_id)
        )
    )
  )
);

-- Participating Clubs Policies
CREATE POLICY "Participating clubs viewable by all" ON event_participating_clubs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Participating clubs insertable by organizer" ON event_participating_clubs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.organizer_user_id = auth.uid())
);
CREATE POLICY "Participating clubs deletable by organizer" ON event_participating_clubs FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.organizer_user_id = auth.uid())
);

-- Participants Policies
-- The app treats co-organizers as full organizers, so they can approve join
-- requests and record attendance alongside the lead organizer.
CREATE POLICY "Participants viewable by authenticated users" ON event_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join events" ON event_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Participants updatable by self or organizing team" ON event_participants FOR UPDATE TO authenticated USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_participants.event_id
      AND (e.organizer_user_id = auth.uid() OR auth.uid() = ANY(e.co_organizer_user_ids))
  )
);
-- Leaving an event and declining a join request both delete the row.
CREATE POLICY "Participants deletable by self or organizing team" ON event_participants FOR DELETE TO authenticated USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_participants.event_id
      AND (e.organizer_user_id = auth.uid() OR auth.uid() = ANY(e.co_organizer_user_ids))
  )
);

-- Invitations Policies
CREATE POLICY "Invitations viewable by participants" ON event_invitations FOR SELECT TO authenticated USING (
  auth.uid() = invited_user_id OR auth.uid() = invited_by_user_id
);
CREATE POLICY "Invitations insertable by inviters" ON event_invitations FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = invited_by_user_id
);
CREATE POLICY "Invitations updatable by invitee" ON event_invitations FOR UPDATE TO authenticated USING (
  auth.uid() = invited_user_id
);

-- The invitee may answer an invitation but must not rewrite who was invited or by whom.
CREATE OR REPLACE FUNCTION guard_invitation_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.invited_user_id IS DISTINCT FROM OLD.invited_user_id
     OR NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id THEN
    RAISE EXCEPTION 'Invitation parties cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_invitation_update
  BEFORE UPDATE ON event_invitations
  FOR EACH ROW EXECUTE FUNCTION guard_invitation_update();

-- Impact Policies
CREATE POLICY "Impacts viewable by authenticated" ON event_impacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Impacts insertable by organizing team" ON event_impacts FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_id
      AND (e.organizer_user_id = auth.uid() OR auth.uid() = ANY(e.co_organizer_user_ids))
  )
);
CREATE POLICY "Impacts updatable by organizing team" ON event_impacts FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = event_id
      AND (e.organizer_user_id = auth.uid() OR auth.uid() = ANY(e.co_organizer_user_ids))
  )
);

-- Verification Application Policies
CREATE POLICY "Applications viewable by relevant users" ON verification_applications FOR SELECT TO authenticated USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('APP_ADMIN', 'DISTRICT_ADMIN')
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'CLUB_PRESIDENT'
      AND p.club_id = verification_applications.club_id
  )
);
CREATE POLICY "Applications insertable by applicant" ON verification_applications FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
);
CREATE POLICY "Applications updatable by reviewers" ON verification_applications FOR UPDATE TO authenticated USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('APP_ADMIN', 'DISTRICT_ADMIN')
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'CLUB_PRESIDENT'
      AND p.club_id = verification_applications.club_id
  )
);

-- Applicants may edit their own submission (member id, club, position, proof) but
-- must never move its status — only reviewers can do that.
CREATE OR REPLACE FUNCTION guard_verification_application_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only reviewers can change application status';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_verification_application_update
  BEFORE UPDATE ON verification_applications
  FOR EACH ROW EXECUTE FUNCTION guard_verification_application_update();

-- Review-application transition (SECURITY DEFINER). Approving a member marks
-- THEIR profile verified, but profiles RLS only lets a user update their own
-- row, so a reviewer could never finalize anyone. This performs the whole
-- transition atomically and enforces authorization by the caller's role:
--   APP_ADMIN — any action at any stage; DISTRICT_ADMIN — president apps;
--   CLUB_PRESIDENT — their own club's non-president apps.
CREATE OR REPLACE FUNCTION review_application(p_app_id uuid, p_action text, p_notes text DEFAULT '')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF NOT v_is_president THEN RAISE EXCEPTION 'District Admin reviews president applications only'; END IF;
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
    WHEN 'CLUB_VALIDATE'    THEN 'VERIFIED'   -- President approval is final for their club's members
    WHEN 'DISTRICT_APPROVE' THEN 'VERIFIED'
    WHEN 'ADMIN_APPROVE'    THEN 'VERIFIED'
    WHEN 'REQUEST_INFO'     THEN 'NEEDS_INFORMATION'
    WHEN 'REJECT'           THEN 'REJECTED'
    ELSE NULL
  END)::verification_status;
  IF v_new_status IS NULL THEN RAISE EXCEPTION 'Unknown action %', p_action; END IF;

  UPDATE verification_applications
    SET status = v_new_status, notes = COALESCE(NULLIF(p_notes, ''), notes)
    WHERE id = p_app_id;
  UPDATE profiles SET verification_status = v_new_status WHERE id = v_app.user_id;
  INSERT INTO audit_logs (application_id, action, performed_by_name, performed_by_role, previous_status, new_status, notes)
  VALUES (p_app_id, p_action, v_actor.full_name, v_actor.role, v_app.status, v_new_status, COALESCE(p_notes, ''));

  RETURN v_new_status::text;
END;
$$;
GRANT EXECUTE ON FUNCTION review_application(uuid, text, text) TO authenticated;

-- App Admin can permanently remove a user. Deleting from auth.users cascades to
-- the profile and all their data. SECURITY DEFINER to reach the auth schema;
-- restricted to callers whose profile role is APP_ADMIN.
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- Audit Log Policies
CREATE POLICY "Audit logs viewable by admins and club presidents" ON audit_logs FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('APP_ADMIN', 'DISTRICT_ADMIN', 'CLUB_PRESIDENT')
  )
);
CREATE POLICY "Audit logs insertable by reviewers" ON audit_logs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('APP_ADMIN', 'DISTRICT_ADMIN', 'CLUB_PRESIDENT')
  )
);

-- Notifications Policies
CREATE POLICY "Notifications viewable by recipient" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications updatable by recipient" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications deletable by recipient" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications insertable by system" ON notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Direct Messaging Policies
CREATE POLICY "Conversations viewable by participants" ON conversations FOR SELECT TO authenticated USING (
  auth.uid() = participant_user_id OR auth.uid() = organizer_user_id
  OR (is_group AND EXISTS (
    SELECT 1 FROM event_participants ep
    WHERE ep.event_id = conversations.event_id
      AND ep.user_id = auth.uid()
      AND ep.status = 'JOINED'
  ))
);
-- 1-on-1 conversations are opened by either party; a group conversation is opened
-- by the organizer or any JOINED participant (whoever taps the chat first).
CREATE POLICY "Conversations insertable by participants" ON conversations FOR INSERT TO authenticated WITH CHECK (
  (NOT is_group AND (auth.uid() = participant_user_id OR auth.uid() = organizer_user_id))
  OR (
    is_group
    AND participant_user_id IS NULL
    AND (
      auth.uid() = organizer_user_id
      OR EXISTS (
        SELECT 1 FROM event_participants ep
        WHERE ep.event_id = conversations.event_id
          AND ep.user_id = auth.uid()
          AND ep.status = 'JOINED'
      )
    )
  )
);
CREATE POLICY "Conversations updatable by participants" ON conversations FOR UPDATE TO authenticated USING (
  auth.uid() = participant_user_id OR auth.uid() = organizer_user_id
  OR (is_group AND EXISTS (
    SELECT 1 FROM event_participants ep
    WHERE ep.event_id = conversations.event_id
      AND ep.user_id = auth.uid()
      AND ep.status = 'JOINED'
  ))
);
-- Group messages (receiver_id IS NULL) are readable by the organizer and every
-- JOINED participant of the conversation's event.
CREATE POLICY "Messages viewable by conversation participants" ON direct_messages FOR SELECT TO authenticated USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
  OR EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = direct_messages.conversation_id
      AND c.is_group
      AND (
        c.organizer_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM event_participants ep
          WHERE ep.event_id = c.event_id
            AND ep.user_id = auth.uid()
            AND ep.status = 'JOINED'
        )
      )
  )
);
-- Senders must actually belong to the conversation they post to.
CREATE POLICY "Messages insertable by sender" ON direct_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = direct_messages.conversation_id
      AND (
        auth.uid() = c.organizer_user_id
        OR auth.uid() = c.participant_user_id
        OR (c.is_group AND EXISTS (
          SELECT 1 FROM event_participants ep
          WHERE ep.event_id = c.event_id
            AND ep.user_id = auth.uid()
            AND ep.status = 'JOINED'
        ))
      )
  )
);

-- ==========================================
-- 5. STORAGE (PHOTO UPLOADS)
-- ==========================================
-- Path conventions:
--   avatars:              <user_id>/<filename>          (public read)
--   event-covers:         <event_id>/<filename>         (public read)
--   verification-proofs:  <user_id>/<filename>          (private — ID documents)
-- Use src/services/storage.ts (uploadImage / getPublicImageUrl / getSignedImageUrl).

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('event-covers', 'event-covers', true),
  ('verification-proofs', 'verification-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Avatars: world-readable, users manage only their own folder.
CREATE POLICY "Avatars are publicly readable" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users manage their own avatar" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Event covers: world-readable; any authenticated member can upload (the events
-- table's own RLS still governs who may attach the URL to an event).
CREATE POLICY "Event covers are publicly readable" ON storage.objects FOR SELECT USING (bucket_id = 'event-covers');
CREATE POLICY "Members can upload event covers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-covers');
CREATE POLICY "Members can replace event covers" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'event-covers');

-- Verification proofs: owner uploads/manages; readable by the owner, district/app
-- admins, and the Club President of the club named in that applicant's application.
CREATE POLICY "Applicants upload their own proof" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Applicants manage their own proof" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'verification-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Applicants delete their own proof" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'verification-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Proofs readable by owner and reviewers" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'verification-proofs'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('APP_ADMIN', 'DISTRICT_ADMIN')
    )
    OR EXISTS (
      SELECT 1
      FROM verification_applications va
      JOIN profiles reviewer ON reviewer.id = auth.uid()
      WHERE va.user_id::text = (storage.foldername(name))[1]
        AND reviewer.role = 'CLUB_PRESIDENT'
        AND reviewer.club_id = va.club_id
    )
  )
);

-- ==========================================
-- 6. REALTIME PUBLICATION
-- ==========================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
