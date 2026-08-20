import { Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RotaractEvent } from '../types';
import { getEventGeofenceRadius, checkInWindow } from '../utils/checkIn';
import { notifyAttendance } from './notifications';
import { supabase } from './supabase';
import { enqueueOfflineCheckIn } from './offlineQueue';

export const ROTARACT_GEOFENCING_TASK = 'rotaract-geofencing-task';
const STORAGE_KEY_GEOFENCE_EVENTS = '@rotaract_geofence_events';

// Guarded TaskManager import
let TaskManager: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  TaskManager = require('expo-task-manager');
} catch {
  TaskManager = null;
}

// 1. Define OS-level Geofencing Background Task
if (TaskManager && typeof TaskManager.defineTask === 'function') {
  try {
    TaskManager.defineTask(
      ROTARACT_GEOFENCING_TASK,
      async ({ data: { eventType, region }, error }: any) => {
        if (error) {
          console.warn('[Geofencing Task] Error:', error.message);
          return;
        }

        if (!region || !region.identifier) return;

        const eventId = region.identifier;
        const isEntering = eventType === Location.GeofencingEventType.Enter;
        const isExiting = eventType === Location.GeofencingEventType.Exit;
        const nowIso = new Date().toISOString();

        // Retrieve cached events metadata
        let eventTitle = 'Rotaract Event';
        try {
          const rawEvents = await AsyncStorage.getItem(STORAGE_KEY_GEOFENCE_EVENTS);
          if (rawEvents) {
            const events: RotaractEvent[] = JSON.parse(rawEvents);
            const found = events.find(e => e.id === eventId);
            if (found) eventTitle = found.title;
          }
        } catch {
          // ignore cache read error
        }

        // Get authenticated user ID
        let userId: string | null = null;
        try {
          const { data } = await supabase.auth.getSession();
          userId = data?.session?.user?.id ?? null;
        } catch {
          // ignore
        }

        if (!userId) {
          try {
            const rawAuth = await AsyncStorage.getItem('@rotaract_auth_user');
            if (rawAuth) {
              const u = JSON.parse(rawAuth);
              userId = u.id;
            }
          } catch {
            // ignore
          }
        }

        if (isEntering) {
          console.log(`[Geofencing] Entered perimeter for ${eventTitle} (${eventId})`);

          const updates: any = {
            attendance_status: 'ATTENDED',
            checked_in_at: nowIso,
            check_in_latitude: region.latitude,
            check_in_longitude: region.longitude,
            check_in_distance_m: 0,
            check_in_method: 'SELF_GPS',
          };

          if (userId) {
            try {
              const { error: dbError } = await supabase
                .from('event_participants')
                .update(updates)
                .match({ event_id: eventId, user_id: userId });

              if (dbError) {
                enqueueOfflineCheckIn(`${eventId}_${userId}`, updates);
              }
            } catch {
              enqueueOfflineCheckIn(`${eventId}_${userId}`, updates);
            }
          }

          // Trigger high-priority arrival notification banner even with app closed
          await notifyAttendance('CHECK_IN', eventTitle, 0);
        } else if (isExiting) {
          console.log(`[Geofencing] Exited perimeter for ${eventTitle} (${eventId})`);

          const updates: any = {
            checked_out_at: nowIso,
            check_out_latitude: region.latitude,
            check_out_longitude: region.longitude,
            check_out_distance_m: region.radius,
            check_out_method: 'AUTO_PERIMETER_LEAVE',
          };

          if (userId) {
            try {
              const { error: dbError } = await supabase
                .from('event_participants')
                .update(updates)
                .match({ event_id: eventId, user_id: userId });

              if (dbError) {
                enqueueOfflineCheckIn(`${eventId}_${userId}`, updates);
              }
            } catch {
              enqueueOfflineCheckIn(`${eventId}_${userId}`, updates);
            }
          }

          // Trigger departure notification banner
          await notifyAttendance('CHECK_OUT', eventTitle, region.radius);
        }
      }
    );
  } catch (err) {
    console.warn('[Geofencing] Failed to defineTask:', err);
  }
}

/**
 * Synchronize device OS geofences with all upcoming active events that the user has joined.
 */
export async function syncEventGeofences(joinedEvents: RotaractEvent[]): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    if (!TaskManager || typeof TaskManager.isTaskRegisteredAsync !== 'function') {
      return false;
    }
    if (typeof Location.startGeofencingAsync !== 'function') {
      return false;
    }

    // Check permissions
    const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    // Filter events active today or in the next 24 hours
    const now = new Date();
    const nowMs = now.getTime();
    const next24hMs = nowMs + 24 * 60 * 60 * 1000;

    const activeEvents = joinedEvents.filter(ev => {
      if (ev.status === 'COMPLETED' || ev.status === 'CANCELLED') return false;
      if (typeof ev.latitude !== 'number' || typeof ev.longitude !== 'number') return false;

      const startMs = new Date(ev.start_datetime).getTime();
      const endMs = new Date(ev.end_datetime).getTime();

      // Check if event is happening within 24 hours or currently open
      const isWithin24h = startMs <= next24hMs && endMs >= nowMs;
      const windowState = checkInWindow(ev, now).state;

      return isWithin24h || windowState === 'OPEN';
    });

    // Save active events to AsyncStorage so background task can access titles
    try {
      await AsyncStorage.setItem(STORAGE_KEY_GEOFENCE_EVENTS, JSON.stringify(activeEvents));
    } catch {
      // ignore
    }

    const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(ROTARACT_GEOFENCING_TASK);

    if (activeEvents.length === 0) {
      if (isTaskRegistered && typeof Location.stopGeofencingAsync === 'function') {
        await Location.stopGeofencingAsync(ROTARACT_GEOFENCING_TASK);
      }
      return true;
    }

    // Construct OS-level Geofence Regions
    const regions: Location.LocationRegion[] = activeEvents.map(ev => ({
      identifier: ev.id,
      latitude: ev.latitude,
      longitude: ev.longitude,
      radius: getEventGeofenceRadius(ev),
      notifyOnEnter: true,
      notifyOnExit: true,
    }));

    // Register with iOS CoreLocation / Google Play Services Geofencing
    await Location.startGeofencingAsync(ROTARACT_GEOFENCING_TASK, regions);
    console.log(`[Geofencing] Successfully armed ${regions.length} OS geofence region(s)`);
    return true;
  } catch (err) {
    console.warn('[Geofencing] Failed to sync event geofences:', err);
    return false;
  }
}

/**
 * Stop and unregister all event geofences.
 */
export async function stopAllGeofences(): Promise<void> {
  try {
    if (!TaskManager || typeof TaskManager.isTaskRegisteredAsync !== 'function') return;
    if (typeof Location.stopGeofencingAsync !== 'function') return;

    const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(ROTARACT_GEOFENCING_TASK);
    if (isTaskRegistered) {
      await Location.stopGeofencingAsync(ROTARACT_GEOFENCING_TASK);
    }
  } catch (err) {
    console.warn('[Geofencing] Failed to stop geofences:', err);
  }
}
