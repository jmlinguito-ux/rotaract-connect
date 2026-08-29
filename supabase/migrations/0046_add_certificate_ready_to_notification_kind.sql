-- Add CERTIFICATE_READY to notification_kind enum if not present
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'CERTIFICATE_READY';
