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
