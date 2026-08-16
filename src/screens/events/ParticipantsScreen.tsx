import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { formatDistance } from '../../utils/checkIn';
import { DeclineReasonModal } from '../../components/DeclineReasonModal';
import { UserProfileModal } from '../../components/UserProfileModal';
import UserAvatar from '../../components/UserAvatar';
import VerifiedCheck, { VerifiedName } from '../../components/VerifiedCheck';
import { AppUser } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Participants'>;

export default function ParticipantsScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const { events, users, participantsFor, approveParticipant, declineParticipant, getOrCreateConversation } = useData();
  const event = events.find(e => e.id === eventId);
  const all = participantsFor(eventId);
  const joined = all.filter(p => p.status === 'JOINED');
  const pending = all.filter(p => p.status === 'PENDING');

  const organizerUser = users.find(u => u.id === event?.organizer_user_id);

  const [declineTarget, setDeclineTarget] = useState<{
    participantId: string;
    applicantName?: string;
  } | null>(null);

  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  const isOrganizer = user?.id === event?.organizer_user_id || (user?.role === 'CLUB_PRESIDENT' && user?.club_id === event?.organizing_club_id);

  const sections = [
    ...(organizerUser ? [{ key: 'organizer', title: 'EVENT ORGANIZER', data: [{ isOrganizerCard: true, user: organizerUser }] }] : []),
    ...(pending.length > 0 ? [{ key: 'pending', title: `PENDING APPROVAL (${pending.length})`, data: pending.map(p => ({ isOrganizerCard: false, participant: p })) }] : []),
    { key: 'joined', title: `JOINED PARTICIPANTS (${joined.length})`, data: joined.map(p => ({ isOrganizerCard: false, participant: p })) },
  ];

  const handleConfirmDecline = (reason: string) => {
    if (!declineTarget || !user) return;
    declineParticipant(declineTarget.participantId, user, reason);
    setDeclineTarget(null);
    Alert.alert('Declined', 'Join request declined and reason sent to participant inbox.');
  };

  const handleStartChat = (target: AppUser, aboutEvent: boolean) => {
    if (!user) return;
    const ctxEventId = aboutEvent ? event?.id : undefined;
    const conv = getOrCreateConversation(ctxEventId, user, target.id, target.full_name, aboutEvent ? event?.title : undefined);
    navigation.navigate('Chat', {
      conversationId: conv.id,
      eventId: ctxEventId,
      recipientId: target.id,
      recipientName: target.full_name,
      eventTitle: aboutEvent ? event?.title : undefined,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={sections.flatMap(s => [
          { type: 'header', title: s.title, key: s.key + 'h' } as any,
          ...s.data.map((d: any, idx) => ({ type: 'item', data: d, key: `${s.key}_${idx}` } as any)),
        ])}
        keyExtractor={i => i.key}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item }) => {
          if (item.type === 'header') return <Text style={styles.sectionTitle}>{item.title}</Text>;

          if (item.data.isOrganizerCard) {
            const org = item.data.user;
            return (
              <TouchableOpacity
                style={[styles.row, styles.organizerRow]}
                onPress={() => setSelectedUser(org)}
                activeOpacity={0.8}
              >
                <UserAvatar user={org} size={40} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameBadgeRow}>
                    <Text style={styles.name}>{org.full_name}</Text>
                    <VerifiedCheck user={org} size={13} />
                    <View style={styles.orgBadgePill}>
                      <Ionicons name="star" size={10} color="#B45309" />
                      <Text style={styles.orgBadgeText}>Organizer</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{org.club_name} • {org.position}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            );
          }

          const p = item.data.participant;
          const u = users.find(x => x.id === p.user_id);
          const isCheckedIn = p.checked_in_at || p.attendance_status === 'ATTENDED';

          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => u && setSelectedUser(u)}
              activeOpacity={0.8}
            >
              {u ? (
                <UserAvatar user={u} size={40} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>?</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <VerifiedName user={u} textStyle={styles.name} numberOfLines={1} checkSize={13} />
                <Text style={styles.meta}>{u?.club_name} • {u?.position}</Text>
                {isCheckedIn ? (
                  <View style={styles.checkInBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={styles.checkInBadgeText}>
                      Checked-In {p.check_in_distance_m ? `(${formatDistance(p.check_in_distance_m)})` : ''}
                    </Text>
                  </View>
                ) : p.attendance_status === 'ABSENT' ? (
                  <Text style={[styles.attendance, { color: colors.danger }]}>ABSENT</Text>
                ) : null}
              </View>

              {isOrganizer && p.status === 'PENDING' && user ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => {
                      approveParticipant(p.id, user);
                      Alert.alert('Approved!', `${u?.full_name ?? 'Participant'} approved.`);
                    }}
                  >
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => setDeclineTarget({ participantId: p.id, applicantName: u?.full_name })}
                  >
                    <Ionicons name="close" size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No participants yet.</Text>}
      />

      <DeclineReasonModal
        visible={!!declineTarget}
        applicantName={declineTarget?.applicantName}
        eventTitle={event?.title}
        onConfirm={handleConfirmDecline}
        onCancel={() => setDeclineTarget(null)}
      />

      <UserProfileModal
        visible={!!selectedUser}
        targetUser={selectedUser}
        onClose={() => setSelectedUser(null)}
        eventContext={event ? { eventId: event.id, eventTitle: event.title } : undefined}
        onStartChat={handleStartChat}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.8, marginTop: 14, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  organizerRow: { backgroundColor: '#FFFDF0', borderColor: '#FCD34D' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  nameBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  orgBadgePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FCD34D' },
  orgBadgeText: { fontSize: 10, fontWeight: '800', color: '#B45309' },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  attendance: { fontSize: 11, fontWeight: '800', marginTop: 3, letterSpacing: 0.5 },
  checkInBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  checkInBadgeText: { fontSize: 11, fontWeight: '700', color: colors.success },
  approveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  declineBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
