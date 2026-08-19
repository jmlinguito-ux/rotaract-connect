-- Migration 0025: Add check-out tracking columns to event_participants

ALTER TABLE event_participants
ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS check_out_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS check_out_longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS check_out_distance_m DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS check_out_method TEXT;

COMMENT ON COLUMN event_participants.checked_out_at IS 'When the participant checked out of the event on-site, manually, or via 60-minute perimeter auto-leave';
COMMENT ON COLUMN event_participants.check_out_method IS 'Method of check-out: SELF_GPS, AUTO_PERIMETER_LEAVE, or ORGANIZER';
