import { supabase } from './supabase';
import { AppUser, EmergencyAlert } from '../types';
import { distanceMeters } from '../utils/checkIn';
import * as Location from 'expo-location';
import { getDeviceLocationOnDemand, isSafetyNetworkEnabled } from './backgroundLocation';
import { notifyEmergencyBroadcast } from './notifications';

const SOS_CHANNEL_NAME = 'rotaract-emergency-sos';
export const MAX_EMERGENCY_RADIUS_METERS = 5000; // 5 km radius

type AlertCallback = (alert: EmergencyAlert, distanceMetersAway: number) => void;
type ResolveCallback = (alertId: string) => void;
type ActiveUserSosCallback = (alert: EmergencyAlert | null) => void;

const alertListeners = new Set<AlertCallback>();
const resolveListeners = new Set<ResolveCallback>();
const activeUserSosListeners = new Set<ActiveUserSosCallback>();

let activeChannel: any = null;
let currentAlerts: Map<string, EmergencyAlert> = new Map();
let currentActiveUserAlert: EmergencyAlert | null = null;
let latestReceivedAlert: { alert: EmergencyAlert; distanceMetersAway: number } | null = null;

export const EMERGENCY_HOTLINES = [
  { name: 'National Emergency', number: '911', icon: 'shield', color: '#EF4444', subtitle: 'Police, Fire & Medical' },
  { name: 'Philippine Red Cross', number: '143', icon: 'medkit', color: '#DC2626', subtitle: 'Ambulance & Rescue' },
];

/**
 * Gets the latest received emergency alert (if any).
 */
export function getLatestReceivedAlert(): { alert: EmergencyAlert; distanceMetersAway: number } | null {
  return latestReceivedAlert;
}

/**
 * Clears the latest received alert.
 */
export function clearLatestReceivedAlert(): void {
  latestReceivedAlert = null;
}

/**
 * Gets the current user's active SOS alert (if they are the broadcaster).
 */
export function getActiveUserSos(): EmergencyAlert | null {
  return currentActiveUserAlert;
}

/**
 * Subscribes to the active user's SOS state changes.
 */
export function subscribeToActiveUserSos(callback: ActiveUserSosCallback): () => void {
  activeUserSosListeners.add(callback);
  callback(currentActiveUserAlert);
  return () => {
    activeUserSosListeners.delete(callback);
  };
}

function setActiveUserSos(alert: EmergencyAlert | null) {
  currentActiveUserAlert = alert;
  activeUserSosListeners.forEach(cb => cb(alert));
}

/**
 * Manually dispatches an emergency alert to all listeners (e.g. when an SOS notification is tapped).
 */
export async function dispatchLocalAlert(alert: EmergencyAlert) {
  currentAlerts.set(alert.id, alert);
  let distance = 0;
  const loc = await getDeviceLocationOnDemand();
  if (loc) {
    distance = distanceMeters(
      { latitude: loc.latitude, longitude: loc.longitude },
      { latitude: alert.latitude, longitude: alert.longitude }
    );
  }
  latestReceivedAlert = { alert, distanceMetersAway: distance };
  alertListeners.forEach(cb => cb(alert, distance));
}

/**
 * Generates a clean web/mobile Google Maps navigation URL
 */
export function generateMapsLink(latitude: number, longitude: number): string {
  return `https://maps.google.com/?q=${latitude},${longitude}`;
}

/**
 * Initializes subscription to the global Supabase Realtime emergency SOS channel.
 */
export function initEmergencyListener(
  currentUser: AppUser | null,
  onAlertReceived?: AlertCallback,
  onAlertResolved?: ResolveCallback
) {
  if (onAlertReceived) alertListeners.add(onAlertReceived);
  if (onAlertResolved) resolveListeners.add(onAlertResolved);

  if (activeChannel) {
    return () => {
      if (onAlertReceived) alertListeners.delete(onAlertReceived);
      if (onAlertResolved) resolveListeners.delete(onAlertResolved);
    };
  }

  try {
    const channel = supabase.channel(SOS_CHANNEL_NAME, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'sos_alert' }, async ({ payload }: { payload: EmergencyAlert }) => {
        if (!payload || !payload.latitude || !payload.longitude) return;
        if (currentUser && payload.user_id === currentUser.id) return; // Ignore own alert

        const safetyEnabled = await isSafetyNetworkEnabled();
        const isClubPresident = currentUser?.club_id === payload.club_id && currentUser?.role === 'CLUB_PRESIDENT';

        // If user disabled SOS proximity alerts and is not the president, ignore
        if (!safetyEnabled && !isClubPresident) return;

        currentAlerts.set(payload.id, payload);

        // Fetch current device GPS location on-demand to check 5 km radius
        let distance = 0;
        const loc = await getDeviceLocationOnDemand();
        if (loc) {
          distance = distanceMeters(
            { latitude: loc.latitude, longitude: loc.longitude },
            { latitude: payload.latitude, longitude: payload.longitude }
          );
        }

        // Notify if within 5 km OR if current user is the sender's Club President
        const isWithin5km = distance > 0 && distance <= MAX_EMERGENCY_RADIUS_METERS;

        if (isWithin5km || isClubPresident) {
          // Trigger high-priority chime notification
          await notifyEmergencyBroadcast(payload);
          // Trigger in-app alert modal
          alertListeners.forEach(cb => cb(payload, distance));
        }
      })
      .on('broadcast', { event: 'sos_cancel' }, ({ payload }: { payload: { alert_id: string } }) => {
        if (payload?.alert_id) {
          currentAlerts.delete(payload.alert_id);
          resolveListeners.forEach(cb => cb(payload.alert_id));
        }
      })
      .subscribe();

    activeChannel = channel;
  } catch (err) {
    console.warn('Failed to subscribe to emergency SOS channel:', err);
  }

  return () => {
    if (onAlertReceived) alertListeners.delete(onAlertReceived);
    if (onAlertResolved) resolveListeners.delete(onAlertResolved);
  };
}

/**
 * Broadcasts an Emergency SOS to all nearby devices and notifies Club President.
 */
export async function triggerEmergencySOS({
  user,
  customMessage,
  pushNotificationFn,
  presidentUser,
  nearbyUsers,
}: {
  user: AppUser;
  customMessage?: string;
  pushNotificationFn?: (notif: any) => void;
  presidentUser?: AppUser | null;
  nearbyUsers?: AppUser[];
}): Promise<EmergencyAlert> {
  // 1. Get high-accuracy GPS coordinates, falling back to on-demand location
  const cachedLoc = await getDeviceLocationOnDemand();
  let lat = cachedLoc?.latitude ?? 14.7000;
  let lng = cachedLoc?.longitude ?? 120.9822;
  let addressHint = `${user.club_name} Area`;

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      lat = position.coords.latitude;
      lng = position.coords.longitude;

      // Reverse geocode to get street / city hint
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (place) {
        addressHint = [place.street, place.district || place.city, place.region]
          .filter(Boolean)
          .join(', ');
      }
    }
  } catch (e) {
    console.warn('GPS lookup for SOS failed, using fallback coords', e);
  }

  const mapUrl = generateMapsLink(lat, lng);

  const alertPayload: EmergencyAlert = {
    id: `sos_${Date.now()}_${user.id.slice(0, 5)}`,
    user_id: user.id,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    club_id: user.club_id,
    club_name: user.club_name,
    contact_number: user.contact_number,
    latitude: lat,
    longitude: lng,
    map_url: mapUrl,
    address_hint: addressHint,
    message: customMessage || 'URGENT: Rotaractor needs immediate assistance nearby!',
    created_at: new Date().toISOString(),
    status: 'ACTIVE',
  };

  currentAlerts.set(alertPayload.id, alertPayload);

  // 2. Broadcast over Supabase Realtime channel (for foreground instances)
  try {
    if (activeChannel) {
      await activeChannel.send({
        type: 'broadcast',
        event: 'sos_alert',
        payload: alertPayload,
      });
    }
  } catch (err) {
    console.warn('Failed to broadcast SOS via Supabase Realtime:', err);
  }

  // 3. Dispatch Push Notifications for background/closed apps via send-push webhook
  if (pushNotificationFn) {
    const notifiedUserIds = new Set<string>();

    const notePart = customMessage ? ` "${customMessage}"` : '';

    // A. Always notify Club President
    if (presidentUser && presidentUser.id !== user.id) {
      notifiedUserIds.add(presidentUser.id);
      pushNotificationFn({
        user_id: presidentUser.id,
        kind: 'EMERGENCY_BROADCAST',
        title: `🚨 EMERGENCY SOS: ${user.full_name}`,
        message: `${user.full_name} (${user.club_name}) triggered an Emergency SOS near ${addressHint}.${notePart} Map: ${mapUrl}`,
        priority: 'HIGH',
      });
    }

    // B. Fan out push notification to nearby verified members (even when their app is closed)
    if (nearbyUsers && nearbyUsers.length > 0) {
      for (const target of nearbyUsers) {
        if (target.id === user.id || notifiedUserIds.has(target.id)) continue;
        notifiedUserIds.add(target.id);
        pushNotificationFn({
          user_id: target.id,
          kind: 'EMERGENCY_BROADCAST',
          title: `🚨 EMERGENCY SOS: ${user.full_name}`,
          message: `${user.full_name} (${user.club_name}) requested emergency help near ${addressHint}.${notePart} Map: ${mapUrl}`,
          priority: 'HIGH',
        });
      }
    }
  }

  setActiveUserSos(alertPayload);

  // Also simulate local listener trigger for current app instance preview
  alertListeners.forEach(cb => cb(alertPayload, 0));

  return alertPayload;
}

/**
 * Cancels / Marks an active Emergency SOS as safe.
 */
export async function cancelEmergencySOS(alertId: string) {
  currentAlerts.delete(alertId);
  setActiveUserSos(null);

  try {
    if (activeChannel) {
      await activeChannel.send({
        type: 'broadcast',
        event: 'sos_cancel',
        payload: { alert_id: alertId },
      });
    }
  } catch (err) {
    console.warn('Failed to broadcast SOS cancel:', err);
  }

  resolveListeners.forEach(cb => cb(alertId));
}
