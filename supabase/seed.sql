-- ========================================================
-- ROTARACT CONNECT — INITIAL SEED DATA FOR SUPABASE
-- ========================================================
-- Matches the Metro Manila / CAMANAVA clubs used in src/data/mockData.ts.
-- Run this AFTER schema.sql in the Supabase SQL Editor.
--
-- NOTE: clubs are seeded with president_id = NULL on purpose — profiles can only
-- exist for real rows in auth.users, so create those users first (Dashboard →
-- Authentication → Add User), then UPDATE clubs SET president_id = '<auth uid>'.
-- Demo events/participants/applications from src/data/mockData.ts are app-side
-- only; the production database starts empty of user-generated content.

-- Insert Zones (District 3800 zone structure)
INSERT INTO zones (id, zone_number, zone_name) VALUES
  ('11111111-1111-1111-1111-111111111101', 1, 'Zone 1'),
  ('11111111-1111-1111-1111-111111111102', 2, 'Zone 2'),
  ('11111111-1111-1111-1111-111111111103', 3, 'Zone 3'),
  ('11111111-1111-1111-1111-111111111104', 4, 'Zone 4'),
  ('11111111-1111-1111-1111-111111111105', 5, 'Zone 5'),
  ('11111111-1111-1111-1111-111111111106', 6, 'Zone 6'),
  ('11111111-1111-1111-1111-111111111107', 7, 'Zone 7'),
  ('11111111-1111-1111-1111-111111111108', 8, 'Zone 8')
ON CONFLICT (zone_number) DO NOTHING;

-- Insert Initial Clubs (District 3800 — Metro Manila / CAMANAVA)
INSERT INTO clubs (id, club_name, club_code, zone_id, city, province, latitude, longitude, description, member_count) VALUES
  ('22222222-2222-2222-2222-222222222201', 'Rotaract Club of Valenzuela',   'RC-3800-021', '11111111-1111-1111-1111-111111111103', 'Valenzuela',   'Metro Manila', 14.7000, 120.9822, 'Youth service and leadership across Valenzuela City since 2011.', 48),
  ('22222222-2222-2222-2222-222222222202', 'Rotaract Club of Malabon',      'RC-3800-022', '11111111-1111-1111-1111-111111111101', 'Malabon',      'Metro Manila', 14.6570, 120.9569, 'Serving the historic riverside communities of Malabon.', 33),
  ('22222222-2222-2222-2222-222222222203', 'Rotaract Club of Caloocan',     'RC-3800-023', '11111111-1111-1111-1111-111111111102', 'Caloocan',     'Metro Manila', 14.6499, 120.9670, 'Driving community and environmental projects across Caloocan.', 41),
  ('22222222-2222-2222-2222-222222222204', 'Rotaract Club of Marikina',     'RC-3800-024', '11111111-1111-1111-1111-111111111104', 'Marikina',     'Metro Manila', 14.6507, 121.1029, 'Building compassionate young leaders in the Shoe Capital.', 52),
  ('22222222-2222-2222-2222-222222222205', 'Rotaract Club of Mandaluyong',  'RC-3800-025', '11111111-1111-1111-1111-111111111108', 'Mandaluyong',  'Metro Manila', 14.5794, 121.0359, 'A growing family of young professionals serving Mandaluyong.', 37)
ON CONFLICT (club_code) DO NOTHING;
