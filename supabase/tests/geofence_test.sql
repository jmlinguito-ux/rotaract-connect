-- ============================================================================
-- GEOFENCE CHECK-IN TEST FIXTURE
-- Run in the Supabase SQL Editor. Safe to re-run — it resets the same event.
--
-- Sets up an event Patricia Gomez has JOINED (as a participant, not organizer),
-- positioned at YOUR coordinates and timed so check-in is open right now.
--
-- What the app requires for a successful check-in (src/utils/checkIn.ts +
-- EventDetailScreen.handleCheckIn) — this fixture satisfies all of them:
--   1. event.status not COMPLETED / CANCELLED
--   2. the user is VERIFIED                      (Patricia already is)
--   3. a participant row exists for the user
--   4. not already checked in / checked out
--   5. distance <= geofence_radius_meters        <- the geofence itself
--   6. check-in window OPEN: start-30min <= now <= end
-- ============================================================================

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ EDIT THIS BLOCK ONLY                                                     │
-- └──────────────────────────────────────────────────────────────────────────┘
WITH cfg AS (
  SELECT
    14.5916965::double precision AS lat,        -- <<< YOUR LATITUDE
    121.1353233::double precision AS lon,      -- <<< YOUR LONGITUDE
    'Spruce'::text        AS address,
    'Cainta'::text       AS city,
    300::integer              AS radius_m,   -- geofence perimeter
    interval '10 minutes'     AS starts_in,  -- +10m => window already OPEN, and you are "on time"
    interval '3 hours'        AS runs_for
),
me AS (
  SELECT id, club_id FROM profiles WHERE email = 'patricia@rotaract.app'
),
organizer AS (   -- anyone but Patricia; she is only a participant here
  SELECT p.id, p.club_id FROM profiles p, me
  WHERE p.id <> me.id AND p.club_id IS NOT NULL
  ORDER BY (p.club_id = me.club_id) DESC, p.created_at
  LIMIT 1
),
ev AS (
  INSERT INTO events (
    id, title, description, event_type, status,
    start_datetime, end_datetime,
    latitude, longitude, address, city,
    organizing_club_id, organizer_user_id,
    approved_by_club_ids, max_participants, requires_approval,
    visibility, geofence_radius_meters
  )
  SELECT
    '00000000-dead-beef-0000-00000000f00d', 'GEOFENCE TEST EVENT',
    'Fixture for testing GPS check-in. Safe to delete.', 'SERVICE_PROJECT', 'RECRUITING',
    now() + cfg.starts_in, now() + cfg.starts_in + cfg.runs_for,
    cfg.lat, cfg.lon, cfg.address, cfg.city,
    organizer.club_id, organizer.id,
    ARRAY[organizer.club_id], 50, false,
    'VERIFIED_ROTARACTORS', cfg.radius_m
  FROM cfg, organizer
  ON CONFLICT (id) DO UPDATE SET
    status                 = 'RECRUITING',
    start_datetime         = EXCLUDED.start_datetime,
    end_datetime           = EXCLUDED.end_datetime,
    latitude               = EXCLUDED.latitude,
    longitude              = EXCLUDED.longitude,
    address                = EXCLUDED.address,
    city                   = EXCLUDED.city,
    geofence_radius_meters = EXCLUDED.geofence_radius_meters,
    approved_by_club_ids   = EXCLUDED.approved_by_club_ids
  RETURNING *
)
INSERT INTO event_participants (event_id, user_id, status, attendance_status,
                                checked_in_at, check_in_latitude, check_in_longitude,
                                check_in_distance_m, checked_out_at)
SELECT ev.id, me.id, 'JOINED', 'NOT_MARKED', NULL, NULL, NULL, NULL, NULL
FROM ev, me
ON CONFLICT (event_id, user_id) DO UPDATE SET
  status              = 'JOINED',
  attendance_status   = 'NOT_MARKED',
  checked_in_at       = NULL,      -- reset so the test can be run again
  check_in_latitude   = NULL,
  check_in_longitude  = NULL,
  check_in_distance_m = NULL,
  checked_out_at      = NULL;

-- ============================================================================
-- VERIFY — run this after the insert. Every column should read OK/true.
-- ============================================================================
SELECT
  e.title,
  p.full_name                                              AS participant,
  pa.status                                                AS join_status,
  e.geofence_radius_meters                                 AS radius_m,
  to_char(e.start_datetime, 'HH24:MI')                     AS starts,
  to_char(e.end_datetime,   'HH24:MI')                     AS ends,
  to_char(e.start_datetime - interval '30 min', 'HH24:MI') AS checkin_opens,
  CASE
    WHEN now() <  e.start_datetime - interval '30 min' THEN 'BEFORE (too early)'
    WHEN now() >  e.end_datetime                       THEN 'CLOSED (too late)'
    ELSE 'OPEN ✅'
  END                                                      AS window_state,
  (pa.checked_in_at IS NULL)                               AS not_yet_checked_in,
  (p.verification_status = 'VERIFIED')                     AS is_verified,
  (e.status NOT IN ('COMPLETED','CANCELLED'))              AS event_open
FROM events e
JOIN event_participants pa ON pa.event_id = e.id
JOIN profiles p            ON p.id = pa.user_id
WHERE e.id = '00000000-dead-beef-0000-00000000f00d';

-- ============================================================================
-- VARIANTS — run one to test a FAILURE path, then re-run the block above to reset.
-- ============================================================================

-- A. Outside the geofence: shrink the radius to 1m so your real GPS is "too far".
--    Expect: "Check-In Premise Error … please move within 1m".
-- UPDATE events SET geofence_radius_meters = 1
--  WHERE id = '00000000-dead-beef-0000-00000000f00d';

-- B. Window not open yet: push the start 2 hours out.
--    Expect: "Check-In Schedule Error … opens 30 minutes before".
-- UPDATE events SET start_datetime = now() + interval '2 hours',
--                   end_datetime   = now() + interval '5 hours'
--  WHERE id = '00000000-dead-beef-0000-00000000f00d';

-- C. Both wrong at once (radius 1m AND not open).
--    Expect: "Check-In Schedule & Premise Error".
-- UPDATE events SET geofence_radius_meters = 1,
--                   start_datetime = now() + interval '2 hours',
--                   end_datetime   = now() + interval '5 hours'
--  WHERE id = '00000000-dead-beef-0000-00000000f00d';

-- D. Arriving late (window open, but after start) — tests punctuality().
--    Expect: check-in succeeds, recorded as late.
-- UPDATE events SET start_datetime = now() - interval '20 minutes'
--  WHERE id = '00000000-dead-beef-0000-00000000f00d';

-- ============================================================================
-- TEARDOWN
-- ============================================================================
-- DELETE FROM events WHERE id = '00000000-dead-beef-0000-00000000f00d';
