import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors } from '../theme/colors';
import { EventParticipant, RotaractEvent } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  CHECK_IN_OPENS_MINUTES_BEFORE,
  CHECK_IN_RADIUS_M,
  checkInWindow,
  distanceMeters,
  formatDistance,
  punctuality,
} from '../utils/checkIn';

const timeText = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function CheckInCard({ event, participant }: { event: RotaractEvent; participant: EventParticipant }) {
  const { checkIn } = useData();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recomputed on each render so the window reflects the current time.
  const windowState = checkInWindow(event);

  if (participant.checked_in_at) {
    const at = new Date(participant.checked_in_at);
    const { onTime, lateByMinutes } = punctuality(event, at);
    return (
      <View style={[styles.card, styles.cardDone]}>
        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={styles.doneTitle}>Checked in at {timeText(at)}</Text>
          <Text style={styles.doneSub}>
            {onTime ? 'On time' : `Late by ${lateByMinutes} min`}
            {participant.check_in_distance_m !== undefined &&
              ` • ${formatDistance(participant.check_in_distance_m)} from venue`}
          </Text>
        </View>
      </View>
    );
  }

  const handleCheckIn = async () => {
    setBusy(true);
    setError(null);

    if (user?.verification_status !== 'VERIFIED') {
      setError('Unverified members cannot check in directly. Please complete your club membership verification first.');
      setBusy(false);
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is required to confirm you are at the venue.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const meters = distanceMeters(position.coords, {
        latitude: event.latitude,
        longitude: event.longitude,
      });

      if (meters > CHECK_IN_RADIUS_M) {
        setError(
          `You're ${formatDistance(meters)} from ${event.address}. ` +
            `Move within ${CHECK_IN_RADIUS_M} m of the venue to check in.`,
        );
        return;
      }

      const now = new Date();
      // Re-check the window: the user may have sat on this screen a while.
      if (checkInWindow(event, now).state !== 'OPEN') {
        setError('Check-in is not open right now.');
        return;
      }

      checkIn(participant.id, {
        checkedInAt: now.toISOString(),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        distanceMeters: meters,
      });
    } catch {
      setError('Could not read your location. Check that location services are on and try again.');
    } finally {
      setBusy(false);
    }
  };

  const disabled = windowState.state !== 'OPEN' || busy;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="location" size={18} color={colors.primary} />
        <Text style={styles.title}>Check in at the venue</Text>
      </View>

      <Text style={styles.rule}>
        Opens {CHECK_IN_OPENS_MINUTES_BEFORE} minutes before the start, and you must be within{' '}
        {CHECK_IN_RADIUS_M} m of {event.address}.
      </Text>

      {windowState.state === 'BEFORE' && (
        <Text style={styles.gate}>
          Check-in opens at {timeText(windowState.opensAt)}.
        </Text>
      )}
      {windowState.state === 'CLOSED' && <Text style={styles.gate}>This event has ended.</Text>}

      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handleCheckIn}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Check in to this event"
        accessibilityState={{ disabled }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="log-in-outline" size={18} color="#fff" />
            <Text style={styles.buttonText}>Check In</Text>
          </>
        )}
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.success + '14',
    borderColor: colors.success + '44',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '800', color: colors.text },
  rule: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
  gate: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { fontSize: 12, color: colors.danger, marginTop: 8, lineHeight: 17 },
  doneTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  doneSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
