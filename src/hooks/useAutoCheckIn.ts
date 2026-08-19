import { useEffect, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { checkInWindow, distanceMeters, CHECK_IN_RADIUS_M } from '../utils/checkIn';
import { navigate } from '../navigation/navigationRef';

// Ignore GPS fixes with an accuracy circle greater than 50 meters to prevent drift.
const MAX_ACCEPTABLE_ACCURACY_M = 50;

/**
 * App-wide foreground auto check-in watcher.
 *
 * Runs only while the app is in the foreground and the user has autoCheckIn enabled.
 * Scans for joined events whose check-in window is currently OPEN, performs a high/balanced
 * accuracy location read, picks the closest valid venue within CHECK_IN_RADIUS_M, and
 * records attendance automatically with a non-intrusive interactive Toast.
 */
export function useAutoCheckIn() {
  const { user } = useAuth();
  const { autoCheckIn, highAccuracyGps } = usePreferences();
  const { events, participationFor, checkIn } = useData();
  const { showToast } = useToast();

  const checkingRef = useRef(false);
  const checkedInEventIds = useRef<Set<string>>(new Set());

  const evaluateAndCheckIn = useCallback(async () => {
    if (!autoCheckIn || !user || user.verification_status !== 'VERIFIED') return;
    if (checkingRef.current) return;

    // Find all joined events with OPEN check-in windows that haven't been checked in yet
    const candidates = events.filter(ev => {
      if (ev.status === 'COMPLETED' || ev.status === 'CANCELLED') return false;
      if (checkedInEventIds.current.has(ev.id)) return false;
      const part = participationFor(ev.id, user.id);
      if (!part || part.status !== 'JOINED') return false;
      if (part.checked_in_at || part.attendance_status === 'ATTENDED') return false;
      return checkInWindow(ev).state === 'OPEN';
    });

    if (candidates.length === 0) return;

    checkingRef.current = true;
    try {
      if (Platform.OS === 'web') return;

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const accuracy = highAccuracyGps ? Location.Accuracy.Highest : Location.Accuracy.Balanced;
      const pos = await Location.getCurrentPositionAsync({ accuracy });

      // Reject readings with excessive accuracy radius (e.g. cell tower triangulation drift)
      if (pos.coords.accuracy && pos.coords.accuracy > MAX_ACCEPTABLE_ACCURACY_M) {
        return;
      }

      // Calculate distance to each candidate venue and find the closest matching one
      let bestEvent = null;
      let bestDistance = Infinity;
      let bestPart = null;

      for (const ev of candidates) {
        const part = participationFor(ev.id, user.id);
        if (!part) continue;
        const dist = distanceMeters(pos.coords, { latitude: ev.latitude, longitude: ev.longitude });
        if (dist <= CHECK_IN_RADIUS_M && dist < bestDistance) {
          bestDistance = dist;
          bestEvent = ev;
          bestPart = part;
        }
      }

      if (bestEvent && bestPart) {
        checkedInEventIds.current.add(bestEvent.id);
        const eventId = bestEvent.id;
        const eventTitle = bestEvent.title;

        checkIn(bestPart.id, {
          checkedInAt: new Date().toISOString(),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          distanceMeters: bestDistance,
          recordedBy: 'SELF_GPS',
        });

        showToast({
          type: 'success',
          title: 'Checked In Automatically',
          message: `You arrived at ${eventTitle}`,
          actionLabel: 'View Event',
          onAction: () => navigate('EventDetail', { eventId }),
        });
      }
    } catch {
      // Ignore location fetch failures; next tick or app resume will retry
    } finally {
      checkingRef.current = false;
    }
  }, [autoCheckIn, user, events, participationFor, checkIn, highAccuracyGps, showToast]);

  // Trigger evaluation on active state change & periodically every 60s
  useEffect(() => {
    if (!autoCheckIn || !user) return;

    evaluateAndCheckIn();

    const interval = setInterval(evaluateAndCheckIn, 60_000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        evaluateAndCheckIn();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [autoCheckIn, user, evaluateAndCheckIn]);
}
