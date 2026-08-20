-- Add EMERGENCY_BROADCAST and EMERGENCY_SOS to notification_kind enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_kind' AND e.enumlabel = 'EMERGENCY_BROADCAST'
  ) THEN
    ALTER TYPE notification_kind ADD VALUE 'EMERGENCY_BROADCAST';
  END IF;
END $$;
