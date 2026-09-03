import { EventParticipant, RotaractEvent } from '../types';

/**
 * Calculates volunteer hours credited to a participant for an event.
 * Based on actual check-in to check-out duration.
 *
 * Rules:
 * 1. If checked_out_at and checked_in_at exist: actual elapsed time (supports late check-out).
 * 2. If checked_in_at exists but no check_out (e.g. legacy/in-progress): min(12h, max(1h, end - checked_in)).
 * 3. If organizer manually marked ATTENDED (no GPS timestamps): min(12h, max(1h, end - start)).
 * 4. Daily sanity cap: 16 hours maximum per single event.
 */
export function calculateParticipantHours(
  participant: EventParticipant | undefined,
  event: RotaractEvent,
): number {
  if (!participant) return 0;
  const isAttended = participant.attendance_status === 'ATTENDED' || !!participant.checked_in_at;
  if (!isAttended) return 0;

  const startMs = new Date(event.start_datetime).getTime();
  const endMs = new Date(event.end_datetime).getTime();

  let rawHours = 1;

  if (participant.checked_in_at && participant.checked_out_at) {
    const inMs = new Date(participant.checked_in_at).getTime();
    const outMs = new Date(participant.checked_out_at).getTime();
    const diffMs = outMs - inMs;
    rawHours = Math.max(1, Math.round(diffMs / 3600000));
  } else if (participant.checked_in_at) {
    const inMs = new Date(participant.checked_in_at).getTime();
    const targetEnd = Math.max(endMs, inMs + 3600000);
    rawHours = Math.max(1, Math.round((targetEnd - inMs) / 3600000));
  } else {
    rawHours = Math.max(1, Math.round((endMs - startMs) / 3600000));
  }

  // Daily sanity cap: 16 hours max per event
  return Math.min(16, rawHours);
}

/**
 * Returns the current Rotary Year string (e.g. "RY 2026–2027") and its date range.
 * A Rotary Year runs from July 1 of Year Y to June 30 of Year Y+1.
 */
export function getRotaryYear(date: Date = new Date()): {
  label: string;
  startDate: Date;
  endDate: Date;
} {
  const month = date.getMonth(); // 0-indexed: 0=Jan, 6=July, 11=Dec
  const year = date.getFullYear();

  // If before July (Jan-June), we are in Year-1 to Year
  const startYear = month >= 6 ? year : year - 1;
  const endYear = startYear + 1;

  const startDate = new Date(Date.UTC(startYear, 6, 1, 0, 0, 0)); // July 1 00:00:00 UTC
  const endDate = new Date(Date.UTC(endYear, 5, 30, 23, 59, 59, 999)); // June 30 23:59:59.999 UTC

  return {
    label: `RY ${startYear}–${endYear}`,
    startDate,
    endDate,
  };
}

export function isDateInRotaryYear(dateString: string, startDate: Date, endDate: Date): boolean {
  const d = new Date(dateString).getTime();
  return d >= startDate.getTime() && d <= endDate.getTime();
}
