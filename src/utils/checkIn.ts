import { RotaractEvent } from '../types';

/** A participant must be within this many metres of the venue to check in. */
export const CHECK_IN_RADIUS_M = 300;

/** Check-in opens this many minutes before the event's start time. */
export const CHECK_IN_OPENS_MINUTES_BEFORE = 30;

export type Coords = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: Coords, b: Coords): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export type WindowState = 'BEFORE' | 'OPEN' | 'CLOSED';

export type CheckInWindow = {
  state: WindowState;
  opensAt: Date;
  closesAt: Date;
};

/**
 * Check-in runs from 30 minutes before the start until the event ends. Closing
 * at the end stops people checking in to something already finished.
 */
export function checkInWindow(event: RotaractEvent, now: Date = new Date()): CheckInWindow {
  const start = new Date(event.start_datetime);
  const opensAt = new Date(start.getTime() - CHECK_IN_OPENS_MINUTES_BEFORE * 60_000);
  const closesAt = new Date(event.end_datetime);

  const state: WindowState = now < opensAt ? 'BEFORE' : now > closesAt ? 'CLOSED' : 'OPEN';
  return { state, opensAt, closesAt };
}

/** Whether the participant made it by the advertised start time. */
export function punctuality(event: RotaractEvent, checkedInAt: Date): { onTime: boolean; lateByMinutes: number } {
  const start = new Date(event.start_datetime);
  const lateMs = checkedInAt.getTime() - start.getTime();
  return {
    onTime: lateMs <= 0,
    lateByMinutes: Math.max(0, Math.round(lateMs / 60_000)),
  };
}

