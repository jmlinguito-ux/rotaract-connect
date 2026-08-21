import { EventParticipant, RotaractEvent } from '../types';

export const ROTARACT_GEOFENCING_TASK = 'rotaract-geofencing-task';

/**
 * The events one user has joined (or already attended), from raw participant rows.
 */
export function joinedEventsFor(
  participants: EventParticipant[],
  events: RotaractEvent[],
  userId: string,
): RotaractEvent[] {
  const joinedIds = new Set(
    participants
      .filter(p => p.user_id === userId && (p.status === 'JOINED' || p.attendance_status === 'ATTENDED'))
      .map(p => p.event_id),
  );
  return events.filter(e => joinedIds.has(e.id));
}

/**
 * No-op: OS-level background geofencing removed to conserve battery.
 */
export async function syncEventGeofences(_joinedEvents: RotaractEvent[]): Promise<boolean> {
  return true;
}

/**
 * Stop and unregister all event geofences (no-op).
 */
export async function stopAllGeofences(): Promise<void> {
  // Geofencing is disabled.
}

export async function rearmGeofencesFromStorage(): Promise<boolean> {
  return false;
}

export async function requestBatteryOptimizationExemption(_packageName: string): Promise<void> {
  // Not required when background geofencing is disabled.
}

export async function isBatteryOptimizationIgnored(): Promise<boolean> {
  return true;
}

