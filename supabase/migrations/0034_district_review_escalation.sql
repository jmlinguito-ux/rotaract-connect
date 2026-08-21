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
