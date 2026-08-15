import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import UserAvatar from '../../components/UserAvatar';
import { VerifiedName } from '../../components/VerifiedCheck';
import { RootStackParamList } from '../../navigation/types';
import { formatDistance, punctuality } from '../../utils/checkIn';
import { EventParticipant } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ActivityPortfolio'>;
type FilterMode = 'ATTENDED' | 'JOINED' | 'ORGANIZED';

export default function ActivityPortfolioScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { userStats, events, participants, impacts } = useData();
  const { colors: themeColors } = useTheme();

  const initialFilter = route.params?.initialFilter || 'ATTENDED';
  const [filter, setFilter] = useState<FilterMode>(initialFilter);

  useEffect(() => {
    if (route.params?.initialFilter) {
      setFilter(route.params.initialFilter);
    }
  }, [route.params?.initialFilter]);

  if (!user) return null;
  const stats = userStats(user.id);

  const joinedParticipants = participants.filter(p => p.user_id === user.id && p.status === 'JOINED');
  const allEventsList = joinedParticipants
    .map(p => {
      const e = events.find(ev => ev.id === p.event_id);
      const imp = impacts.find(i => i.event_id === p.event_id);
      return e ? { event: e, participant: p, impact: imp } : null;
    })
    .filter(Boolean);

  const attendedEventsList = allEventsList.filter(item => {
    const p = item!.participant;
    return p.attendance_status === 'ATTENDED' || !!p.checked_in_at;
  });

  const organizedEventsList = events
    .filter(ev => ev.organizer_user_id === user.id || ev.organizing_club_id === user.club_id)
    .map(ev => {
      const p = participants.find(part => part.event_id === ev.id && part.user_id === user.id);
      const imp = impacts.find(i => i.event_id === ev.id);
      const fallbackParticipant: EventParticipant = {
        id: `p_${ev.id}`,
        event_id: ev.id,
        user_id: user.id,
        status: 'JOINED',
        attendance_status: 'ATTENDED',
        joined_at: ev.start_datetime,
      };
      return {
        event: ev,
        participant: p || fallbackParticipant,
        impact: imp,
      };
    });

  const displayList = filter === 'ATTENDED' ? attendedEventsList : filter === 'JOINED' ? allEventsList : organizedEventsList;

  const badges = [
    { title: 'Verified Rotaractor', icon: 'shield-checkmark', color: themeColors.success, desc: 'Official active status verified' },
    { title: 'Service Leader', icon: 'hands-helping', isFontAwesome: true, color: themeColors.primary, desc: `${stats.service} Service Projects completed` },
    { title: 'Fellowship Enthusiast', icon: 'people', color: themeColors.warning, desc: `${stats.fellowships} Fellowships attended` },
    { title: 'Cross-Club Bridge', icon: 'people', color: themeColors.info, desc: `Collaborated with ${stats.clubsCollab} clubs` },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.header, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <UserAvatar user={user} size={70} style={{ marginBottom: 10 }} />
          <VerifiedName
            user={user}
            textStyle={[styles.name, { color: themeColors.text }]}
            checkSize={16}
          />
          <Text style={[styles.club, { color: themeColors.textMuted }]}>{user.position} • {user.club_name}</Text>
          <View style={[styles.statusPill, { backgroundColor: themeColors.primary + '1A' }]}>
            <Ionicons name="ribbon" size={12} color={themeColors.primary} />
            <Text style={[styles.statusText, { color: themeColors.primary }]}>Rotaract Activity Portfolio</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <StatBox value={stats.joined} label="Joined Events" icon="calendar-outline" color={themeColors.primary} colors={themeColors} onPress={() => setFilter('JOINED')} />
          <StatBox value={organizedEventsList.length} label="Organized" icon="create-outline" color={themeColors.warning} colors={themeColors} onPress={() => setFilter('ORGANIZED')} />
          <StatBox value={stats.hours} label="Hours Rendered" icon="time-outline" color={themeColors.success} colors={themeColors} onPress={() => setFilter('ATTENDED')} />
          <StatBox value={stats.clubsCollab} label="Club Collabs" icon="git-network-outline" color={themeColors.info} colors={themeColors} />
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>Earned Badges & Distinctions</Text>
        <View style={styles.badgesGrid}>
          {badges.map((b, i) => (
            <View key={i} style={[styles.badgeCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
              <View style={[styles.badgeIcon, { backgroundColor: b.color + '20' }]}>
                {b.isFontAwesome ? (
                  <FontAwesome5 name={b.icon as any} size={18} color={b.color} />
                ) : (
                  <Ionicons name={b.icon as any} size={22} color={b.color} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.badgeTitle, { color: themeColors.text }]}>{b.title}</Text>
                <Text style={[styles.badgeDesc, { color: themeColors.textMuted }]}>{b.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.historyHeader}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>Activity & Attendance History</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterToggle}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === 'JOINED' ? themeColors.primary : themeColors.surface,
                  borderColor: filter === 'JOINED' ? themeColors.primary : themeColors.border,
                },
              ]}
              onPress={() => setFilter('JOINED')}
            >
              <Text style={[styles.filterText, { color: filter === 'JOINED' ? '#fff' : themeColors.textMuted }]}>
                Joined ({allEventsList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === 'ORGANIZED' ? themeColors.primary : themeColors.surface,
                  borderColor: filter === 'ORGANIZED' ? themeColors.primary : themeColors.border,
                },
              ]}
              onPress={() => setFilter('ORGANIZED')}
            >
              <Text style={[styles.filterText, { color: filter === 'ORGANIZED' ? '#fff' : themeColors.textMuted }]}>
                Organized ({organizedEventsList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === 'ATTENDED' ? themeColors.primary : themeColors.surface,
                  borderColor: filter === 'ATTENDED' ? themeColors.primary : themeColors.border,
                },
              ]}
              onPress={() => setFilter('ATTENDED')}
            >
              <Text style={[styles.filterText, { color: filter === 'ATTENDED' ? '#fff' : themeColors.textMuted }]}>
                Attended & Hours ({attendedEventsList.length})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {displayList.length === 0 ? (
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>No activities found for this filter.</Text>
        ) : (
          displayList.map((item, idx) => {
            const ev = item!.event;
            const imp = item!.impact;
            const p = item!.participant;
            const isAttended = p.attendance_status === 'ATTENDED' || !!p.checked_in_at;

            let checkInDetails = '';
            if (p.checked_in_at) {
              const checkInDate = new Date(p.checked_in_at);
              const timeStr = checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const pState = punctuality(ev, checkInDate);
              const distStr = p.check_in_distance_m !== undefined ? ` • ${formatDistance(p.check_in_distance_m)}` : '';
              checkInDetails = `Checked in at ${timeStr} (${pState.onTime ? 'On time' : `Late ${pState.lateByMinutes} min`}${distStr})`;
            }

            let renderedHours = 0;
            if (imp && imp.volunteer_hours > 0) {
              renderedHours = imp.volunteer_hours;
            } else {
              const start = new Date(ev.start_datetime).getTime();
              const end = new Date(ev.end_datetime).getTime();
              renderedHours = Math.max(1, Math.round((end - start) / 3600000));
            }

            return (
              <TouchableOpacity
                key={ev.id + idx}
                style={[
                  styles.activityCard,
                  { backgroundColor: themeColors.cardBg, borderColor: isAttended ? themeColors.success + '44' : themeColors.border },
                ]}
                onPress={() => navigation.navigate('EventDetail', { eventId: ev.id })}
              >
                <View style={styles.activityHeader}>
                  <View style={[styles.typePill, { backgroundColor: ev.event_type === 'SERVICE_PROJECT' ? '#EBF9F3' : '#FFF4E5' }]}>
                    {ev.event_type === 'SERVICE_PROJECT' ? (
                      <FontAwesome5 name="hands-helping" size={11} color={themeColors.success} />
                    ) : (
                      <Ionicons name="people" size={12} color={themeColors.warning} />
                    )}
                    <Text style={[styles.typeText, { color: ev.event_type === 'SERVICE_PROJECT' ? themeColors.success : themeColors.warning }]}>
                      {ev.event_type.replace('_', ' ')}
                    </Text>
                  </View>
                  <Text style={[styles.date, { color: themeColors.textMuted }]}>{new Date(ev.start_datetime).toLocaleDateString()}</Text>
                </View>

                <Text style={[styles.actTitle, { color: themeColors.text }]}>{ev.title}</Text>
                <Text style={[styles.actClub, { color: themeColors.textMuted }]}>{ev.organizing_club_name}</Text>

                {isAttended ? (
                  <View style={styles.attendedBox}>
                    <View style={styles.attendedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={themeColors.success} />
                      <Text style={[styles.attendedText, { color: themeColors.success }]}>Attended • {renderedHours} hrs rendered</Text>
                    </View>
                    {checkInDetails ? <Text style={[styles.checkInSub, { color: themeColors.textMuted }]}>{checkInDetails}</Text> : null}
                  </View>
                ) : (
                  <View style={styles.pendingBadge}>
                    <Ionicons name="time-outline" size={14} color={themeColors.warning} />
                    <Text style={[styles.pendingText, { color: themeColors.warning }]}>Joined (Check-In Pending)</Text>
                  </View>
                )}

                {imp && (
                  <View style={styles.impactRow}>
                    <ImpactChip icon="time-outline" text={`${imp.volunteer_hours} total event hrs`} colors={themeColors} />
                    <ImpactChip icon="people-outline" text={`${imp.beneficiaries} beneficiaries`} colors={themeColors} />
                    {imp.funds_raised > 0 && <ImpactChip icon="cash-outline" text={`₱${imp.funds_raised.toLocaleString()}`} colors={themeColors} />}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ value, label, icon, color, colors: c, onPress }: { value: number; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; colors: any; onPress?: () => void }) {
  return (
    <TouchableOpacity style={[styles.statBox, { backgroundColor: c.cardBg, borderColor: c.border }]} onPress={onPress}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={[styles.statLbl, { color: c.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ImpactChip({ icon, text, colors: c }: { icon: keyof typeof Ionicons.glyphMap; text: string; colors: any }) {
  return (
    <View style={[styles.impactChip, { backgroundColor: c.primary + '1A' }]}>
      <Ionicons name={icon} size={11} color={c.primary} />
      <Text style={[styles.impactChipText, { color: c.primary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 16 },
  avatar: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 24 },
  name: { fontSize: 20, fontWeight: '800' },
  club: { fontSize: 13, marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statBox: { width: '48%', padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  statLbl: { fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginVertical: 8 },
  badgesGrid: { gap: 10, marginBottom: 20 },
  badgeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgeTitle: { fontSize: 14, fontWeight: '700' },
  badgeDesc: { fontSize: 12, marginTop: 1 },
  historyHeader: { marginBottom: 10 },
  filterToggle: { flexDirection: 'row', gap: 6, marginTop: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  filterText: { fontSize: 11, fontWeight: '700' },
  activityCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 10, fontWeight: '800' },
  date: { fontSize: 11 },
  actTitle: { fontSize: 15, fontWeight: '700' },
  actClub: { fontSize: 12, marginTop: 2 },
  attendedBox: { marginTop: 8 },
  attendedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attendedText: { fontSize: 12, fontWeight: '700' },
  checkInSub: { fontSize: 11, marginTop: 2, marginLeft: 20 },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pendingText: { fontSize: 12, fontWeight: '600' },
  impactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  impactChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  impactChipText: { fontSize: 11, fontWeight: '700' },
  empty: { textAlign: 'center', marginVertical: 20 },
});
