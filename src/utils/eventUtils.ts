import { RotaractEvent, EventStatus } from '../types';

/**
 * Dynamically resolves the effective status of an event based on current time.
 * If the current time has passed the event's end_datetime, it resolves to 'COMPLETED'.
 * If the current time is between start_datetime and end_datetime, it resolves to 'ONGOING'.
 * Otherwise, preserves configured status (e.g. 'CANCELLED', 'DRAFT', 'PENDING_APPROVAL', 'RECRUITING', 'SCHEDULED').
 */
export function getEffectiveEventStatus(event: RotaractEvent, now: Date = new Date()): EventStatus {
  if (
    event.status === 'CANCELLED' ||
    event.status === 'DRAFT' ||
    event.status === 'PENDING_APPROVAL' ||
    event.status === 'COMPLETED'
  ) {
    return event.status;
  }

  const start = new Date(event.start_datetime).getTime();
  const end = new Date(event.end_datetime).getTime();
  const current = now.getTime();

  if (current > end) {
    return 'COMPLETED';
  }
  if (current >= start && current <= end) {
    return 'ONGOING';
  }
  return event.status;
}
