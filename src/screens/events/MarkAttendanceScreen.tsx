import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors } from '../../theme/colors';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { distanceMeters, formatDistance, punctuality } from '../../utils/checkIn';
import { formatTime } from '../../utils/timeFormat';
import UserAvatar from '../../components/UserAvatar';
import { VerifiedName } from '../../components/VerifiedCheck';

type Props = NativeStackScreenProps<RootStackParamList, 'MarkAttendance'>;

export default function MarkAttendanceScreen({ route }: Props) {
  const { eventId } = route.params;
  const { events, users, participantsFor, checkIn, markAttendance } = useData();
  const { colors: themeColors, isNightMode } = useTheme();

  const [busyId, setBusyId] = useState<string | null>(null);

  const event = events.find(e => e.id === eventId);
  const joined = participantsFor(eventId).filter(p => p.status === 'JOINED');
  const checkedInCount = joined.filter(p => p.checked_in_at || p.attendance_status === 'ATTENDED').length;

  if (!event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]}>
        <Text style={{ padding: 20, color: themeColors.text }}>Event not found.</Text>
      </SafeAreaView>
    );
  }

  const handleCheckInParticipant = async (participantId: string) => {
    setBusyId(participantId);
    try {
      let lat = event.latitude;
      let lon = event.longitude;
      let meters = 0;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        meters = distanceMeters(pos.coords, { latitude: event.latitude, longitude: event.longitude });
      } else {
        // Fallback if location permission not granted: record check-in at event venue
        meters = 0;
      }

      const now = new Date().toISOString();
      checkIn(participantId, {
        checkedInAt: now,
        latitude: lat,
        longitude: lon,
        distanceMeters: Math.round(meters),
        recordedBy: 'ORGANIZER',
      });
    } catch {
      // In case of error reading location, still complete check-in at event venue
      checkIn(participantId, {
        checkedInAt: new Date().toISOString(),
        latitude: event.latitude,
        longitude: event.longitude,
        distanceMeters: 0,
        recordedBy: 'ORGANIZER',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleUndoCheckIn = (participantId: string, name: string) => {
    Alert.alert(
      'Undo Check-In',
      `Are you sure you want to cancel check-in for ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo Check-In',
          style: 'destructive',
          onPress: () => markAttendance(participantId, 'NOT_MARKED'),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <View style={[styles.headerCard, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerRow}>
          <Ionicons name="location" size={20} color={themeColors.primary} />
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>{event.title}</Text>
        </View>
        <Text style={[styles.headerSub, { color: themeColors.textMuted }]}>{event.address}, {event.city}</Text>

        <View style={styles.statBar}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: themeColors.primary }]}>{checkedInCount} / {joined.length}</Text>
            <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Checked-In</Text>
          </View>
          <View style={[styles.progressContainer, { backgroundColor: themeColors.surface }]}>
            <View
              style={[
                styles.progressBar,
                { width: `${joined.length > 0 ? (checkedInCount / joined.length) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>
      </View>

      <FlatList
        data={joined}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const u = users.find(x => x.id === item.user_id);
          const isCheckedIn = !!item.checked_in_at || item.attendance_status === 'ATTENDED';
          const isBusy = busyId === item.id;

          let checkInTimeText = '';
          let punctualityText = '';
          let distanceText = '';

          if (isCheckedIn && item.checked_in_at) {
            const checkInDate = new Date(item.checked_in_at);
            checkInTimeText = formatTime(checkInDate);
            const p = punctuality(event, checkInDate);
            punctualityText = p.onTime ? 'On time' : `Late by ${p.lateByMinutes} min`;
            if (item.check_in_distance_m !== undefined) {
              distanceText = formatDistance(item.check_in_distance_m);
            }
          }

          return (
            <View style={[
              styles.card,
              { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
              isCheckedIn && [styles.cardCheckedIn, { backgroundColor: isNightMode ? themeColors.cardBg : '#F2FAF5', borderColor: colors.success + '44' }],
            ]}>
              <View style={styles.cardHeader}>
                {u ? (
                  <UserAvatar user={u} size={40} />
                ) : (
                  <View style={styles.avatar}><Text style={styles.avatarText}>?</Text></View>
                )}
                <View style={{ flex: 1 }}>
                  <VerifiedName user={u} textStyle={[styles.name, { color: themeColors.text }]} numberOfLines={1} />
                  <Text style={[styles.meta, { color: themeColors.textMuted }]}>{u?.club_name}</Text>
                </View>
                {isCheckedIn && (
                  <View style={styles.checkedInBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={styles.checkedInBadgeText}>Checked In</Text>
                  </View>
                )}
              </View>

              {isCheckedIn ? (
                <View style={[styles.detailsBox, { borderTopColor: themeColors.border }]}>
                  <View style={styles.detailRow}>
                    <Ionicons name="time-outline" size={14} color={themeColors.textMuted} />
                    <Text style={[styles.detailText, { color: themeColors.text }]}>
                      {checkInTimeText ? `Checked in at ${checkInTimeText}` : 'Checked in'}
                      {punctualityText ? ` (${punctualityText})` : ''}
                    </Text>
                  </View>
                  {distanceText ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="navigate-outline" size={14} color={themeColors.textMuted} />
                      <Text style={[styles.detailText, { color: themeColors.text }]}>{distanceText} from event location</Text>
                    </View>
                  ) : null}
                  {item.check_in_method === 'ORGANIZER' && (
                    <View style={styles.detailRow}>
                      <Ionicons name="hand-left-outline" size={14} color={themeColors.textMuted} />
                      <Text style={[styles.detailText, { color: themeColors.text }]}>Recorded by organizer (no GPS verification)</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.undoBtn}
                    onPress={() => handleUndoCheckIn(item.id, u?.full_name || 'Participant')}
                  >
                    <Ionicons name="refresh-outline" size={14} color={colors.danger} />
                    <Text style={styles.undoBtnText}>Undo Check-In</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.checkInBtn, { backgroundColor: themeColors.primary }]}
                  onPress={() => handleCheckInParticipant(item.id)}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="location-outline" size={16} color="#fff" />
                      <Text style={styles.checkInBtnText}>Check In Participant</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No joined participants to check in.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerCard: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
  headerSub: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginLeft: 26 },
  statBar: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  statItem: { alignItems: 'flex-start' },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  progressContainer: { flex: 1, height: 8, backgroundColor: colors.surface, borderRadius: 4, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: colors.success, borderRadius: 4 },
  card: { padding: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  cardCheckedIn: { backgroundColor: '#F2FAF5', borderColor: colors.success + '44' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  checkedInBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.success + '1F', borderRadius: 8 },
  checkedInBadgeText: { fontSize: 11, fontWeight: '700', color: colors.success },
  detailsBox: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 12, color: colors.text, fontWeight: '500' },
  undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' },
  undoBtnText: { fontSize: 12, fontWeight: '700', color: colors.danger },
  checkInBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 10, marginTop: 12 },
  checkInBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
