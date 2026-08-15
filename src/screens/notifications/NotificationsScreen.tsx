import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { RootStackParamList } from '../../navigation/types';
import { AppNotification, NotificationKind, EventParticipant, AppUser, RotaractEvent } from '../../types';
import { DeclineReasonModal } from '../../components/DeclineReasonModal';
import { SwipeableRow } from '../../components/SwipeableRow';
import { BottomSheet } from '../../components/BottomSheet';
import UserAvatar from '../../components/UserAvatar';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const ICON: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  VERIFICATION_UPDATE: 'shield-checkmark',
  ROLE_ASSIGNED: 'key',
  INVITATION_RECEIVED: 'mail',
  INVITATION_RESPONSE: 'checkmark-circle',
  JOIN_REQUEST: 'person-add',
  JOIN_APPROVED: 'checkmark-circle',
  EVENT_REMINDER: 'alarm',
  EVENT_UPDATE: 'refresh',
  EVENT_APPROVAL_REQUEST: 'clipboard',
  EVENT_APPROVED: 'checkmark-circle',
  MEMBERSHIP_REQUEST: 'people',
  INQUIRY_RECEIVED: 'chatbubble-ellipses',
};

const ICON_COLOR: Record<NotificationKind, string> = {
  VERIFICATION_UPDATE: colors.info,
  ROLE_ASSIGNED: colors.warning,
  INVITATION_RECEIVED: colors.primary,
  INVITATION_RESPONSE: colors.success,
  JOIN_REQUEST: colors.warning,
  JOIN_APPROVED: colors.success,
  EVENT_REMINDER: colors.warning,
  EVENT_UPDATE: colors.info,
  EVENT_APPROVAL_REQUEST: colors.warning,
  EVENT_APPROVED: colors.success,
  MEMBERSHIP_REQUEST: colors.warning,
  INQUIRY_RECEIVED: colors.primary,
};

export default function NotificationsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const {
    notificationsFor, markNotificationsRead, deleteNotification, participantsFor, invitationFor,
    approveParticipant, declineParticipant, respondInvitation, users, events,
  } = useData();

  const [reviewModalData, setReviewModalData] = useState<{
    participant: EventParticipant;
    applicant?: AppUser;
    event?: RotaractEvent;
  } | null>(null);

  const [declineTarget, setDeclineTarget] = useState<{
    participantId: string;
    applicantName?: string;
    eventTitle?: string;
  } | null>(null);

  const [inviteDeclineTarget, setInviteDeclineTarget] = useState<{
    invitationId: string;
    inviterName?: string;
    eventTitle?: string;
  } | null>(null);

  React.useEffect(() => {
    if (user) {
      markNotificationsRead(user.id);
    }
  }, [user, markNotificationsRead]);

  if (!user) return null;
  const notifs = notificationsFor(user.id);

  const handleRowPress = (item: AppNotification) => {
    if (item.conversation_id) {
      const senderName = item.title.replace('Inquiry from ', '');
      navigation.navigate('Chat', {
        conversationId: item.conversation_id,
        eventId: item.event_id,
        recipientId: item.user_id,
        recipientName: senderName,
      });
    } else if (item.kind === 'JOIN_REQUEST' && item.event_id) {
      const pendingParts = participantsFor(item.event_id).filter(p => p.status === 'PENDING');
      if (pendingParts.length > 0) {
        const p = pendingParts[0];
        const applicant = users.find(u => u.id === p.user_id);
        const event = events.find(e => e.id === item.event_id);
        setReviewModalData({ participant: p, applicant, event });
      } else {
        navigation.navigate('EventDetail', { eventId: item.event_id });
      }
    } else if (item.event_id) {
      navigation.navigate('EventDetail', { eventId: item.event_id });
    } else if (item.application_id) {
      navigation.navigate('ApplicationReview', { applicationId: item.application_id });
    }
  };

  const handlePromptDecline = (participantId: string, applicantName?: string, eventTitle?: string) => {
    setReviewModalData(null);
    setDeclineTarget({ participantId, applicantName, eventTitle });
  };

  const handleConfirmDecline = (reason: string) => {
    if (!declineTarget) return;
    declineParticipant(declineTarget.participantId, user, reason);
    setDeclineTarget(null);
    Alert.alert('Declined', 'Join request declined and reason sent to participant inbox.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={notifs}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const pendingParticipants = item.kind === 'JOIN_REQUEST' && item.event_id ? participantsFor(item.event_id).filter(p => p.status === 'PENDING') : [];
          const pendingInvitation = item.kind === 'INVITATION_RECEIVED' && item.event_id ? invitationFor(item.event_id, user.id) : undefined;
          const ev = item.event_id ? events.find(e => e.id === item.event_id) : undefined;

          return (
            <SwipeableRow onDelete={() => deleteNotification(item.id)}>
              <TouchableOpacity
                style={[styles.notifRow, !item.is_read && styles.unread]}
                onPress={() => handleRowPress(item)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrap, { backgroundColor: ICON_COLOR[item.kind] + '20' }]}>
                  <Ionicons name={ICON[item.kind]} size={20} color={ICON_COLOR[item.kind]} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.title}>{item.title}</Text>
                    {item.kind === 'JOIN_REQUEST' && (
                      <View style={styles.badgePill}>
                        <Text style={styles.badgeText}>Review Needed</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.msg}>{item.message}</Text>
                  <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>

                  {/* Direct Inline Quick Action Buttons for Join Requests in Inbox */}
                  {item.kind === 'JOIN_REQUEST' && pendingParticipants.length > 0 && (
                    <View style={styles.actionRow}>
                      {pendingParticipants.map(p => {
                        const requester = users.find(u => u.id === p.user_id);
                        return (
                          <View key={p.id} style={styles.inlineActionWrap}>
                            <TouchableOpacity
                              style={styles.approveBtn}
                              onPress={() => {
                                approveParticipant(p.id, user);
                                Alert.alert('Approved!', `${requester?.full_name ?? 'Participant'} was approved and added to the roster.`);
                              }}
                            >
                              <Ionicons name="checkmark-circle" size={14} color="#fff" />
                              <Text style={styles.approveBtnText}>Approve</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.declineBtn}
                              onPress={() => handlePromptDecline(p.id, requester?.full_name, ev?.title)}
                            >
                              <Ionicons name="close-circle" size={14} color={colors.danger} />
                              <Text style={styles.declineBtnText}>Decline</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.viewRosterBtn}
                              onPress={() => item.event_id && navigation.navigate('Participants', { eventId: item.event_id })}
                            >
                              <Text style={styles.viewRosterText}>Roster</Text>
                              <Ionicons name="chevron-forward" size={12} color={colors.primary} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Direct Inline Action Buttons for Event Invitations in Inbox */}
                  {item.kind === 'INVITATION_RECEIVED' && pendingInvitation && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => {
                          respondInvitation(pendingInvitation.id, true, user);
                          Alert.alert('Accepted!', 'You accepted the event invitation.');
                        }}
                      >
                        <Ionicons name="checkmark-circle" size={14} color="#fff" />
                        <Text style={styles.approveBtnText}>Accept</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() =>
                          setInviteDeclineTarget({
                            invitationId: pendingInvitation.id,
                            inviterName: users.find(u => u.id === pendingInvitation.invited_by_user_id)?.full_name,
                            eventTitle: events.find(e => e.id === pendingInvitation.event_id)?.title,
                          })
                        }
                      >
                        <Ionicons name="close-circle" size={14} color={colors.danger} />
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
      />

      {/* Instant Applicant Review & Approval BottomSheet */}
      <BottomSheet
        visible={!!reviewModalData}
        onClose={() => setReviewModalData(null)}
        cardStyle={styles.modalCard}
      >
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderLeft}>
            <Ionicons name="person-add" size={20} color={colors.primary} />
            <Text style={styles.modalTitle}>Review Join Request</Text>
          </View>
          <TouchableOpacity onPress={() => setReviewModalData(null)}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {reviewModalData && (
          <View style={styles.reviewContent}>
            {/* Event Context Header */}
            <View style={styles.eventContextCard}>
              <Text style={styles.eventContextLabel}>Event</Text>
              <Text style={styles.eventContextTitle}>{reviewModalData.event?.title}</Text>
              <Text style={styles.eventContextSub}>
                {reviewModalData.event?.city} • {new Date(reviewModalData.event?.start_datetime ?? '').toLocaleDateString()}
              </Text>
            </View>

            {/* Applicant Profile Details */}
            <View style={styles.applicantCard}>
              <UserAvatar
                user={{ full_name: reviewModalData.applicant?.full_name ?? '' }}
                size={48}
              />

              <View style={{ flex: 1 }}>
                <Text style={styles.applicantName}>{reviewModalData.applicant?.full_name}</Text>
                <Text style={styles.applicantMeta}>
                  {reviewModalData.applicant?.club_name}
                </Text>
                <Text style={styles.applicantRole}>
                  Position: {reviewModalData.applicant?.position}
                </Text>
                <View style={styles.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                  <Text style={styles.verifiedText}>Verified Rotaractor</Text>
                </View>
              </View>
            </View>

            {/* Prominent Action Buttons */}
            <View style={styles.modalActionGroup}>
              <TouchableOpacity
                style={styles.modalApproveBtn}
                onPress={() => {
                  approveParticipant(reviewModalData.participant.id, user);
                  setReviewModalData(null);
                  Alert.alert(
                    'Approved!',
                    `${reviewModalData.applicant?.full_name ?? 'Participant'} was approved and added to the roster.`,
                  );
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.modalApproveText}>Approve & Add to Roster</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalDeclineBtn}
                onPress={() => handlePromptDecline(
                  reviewModalData.participant.id,
                  reviewModalData.applicant?.full_name,
                  reviewModalData.event?.title,
                )}
              >
                <Ionicons name="close-circle" size={18} color={colors.danger} />
                <Text style={styles.modalDeclineText}>Decline Request...</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalRosterLink}
                onPress={() => {
                  const eid = reviewModalData.event?.id;
                  setReviewModalData(null);
                  if (eid) navigation.navigate('Participants', { eventId: eid });
                }}
              >
                <Ionicons name="people-outline" size={16} color={colors.primary} />
                <Text style={styles.modalRosterText}>View Full Participant Roster</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheet>

      {/* Decline Reason Modal */}
      <DeclineReasonModal
        visible={!!declineTarget}
        applicantName={declineTarget?.applicantName}
        eventTitle={declineTarget?.eventTitle}
        onConfirm={handleConfirmDecline}
        onCancel={() => setDeclineTarget(null)}
      />

      <DeclineReasonModal
        visible={!!inviteDeclineTarget}
        title="Decline Invitation"
        description={`Let ${inviteDeclineTarget?.inviterName ?? 'the organizer'} know why you can't join${inviteDeclineTarget?.eventTitle ? ` "${inviteDeclineTarget.eventTitle}"` : ''}. This is optional.`}
        onConfirm={reason => {
          if (user && inviteDeclineTarget) {
            respondInvitation(inviteDeclineTarget.invitationId, false, user, reason);
            setInviteDeclineTarget(null);
            Alert.alert('Declined', 'Event invitation declined and your reason was sent.');
          }
        }}
        onCancel={() => setInviteDeclineTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 40 },
  notifRow: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  unread: { backgroundColor: '#FDF2F7', borderColor: '#F9D6E5' },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  msg: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  badgePill: { backgroundColor: '#FFFBEB', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: '#FCD34D' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#B45309' },
  actionRow: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  inlineActionWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  approveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  approveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  declineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.danger },
  declineBtnText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  viewRosterBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 6 },
  viewRosterText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  sep: { height: 8 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },

  // Modal Styles
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  reviewContent: { gap: 14 },
  eventContextCard: { backgroundColor: colors.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  eventContextLabel: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 0.8 },
  eventContextTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  eventContextSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  applicantCard: { flexDirection: 'row', gap: 14, padding: 14, backgroundColor: '#FDF2F7', borderRadius: 14, borderWidth: 1, borderColor: '#F9D6E5', alignItems: 'center' },
  applicantAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  applicantName: { fontSize: 16, fontWeight: '800', color: colors.text },
  applicantMeta: { fontSize: 13, color: colors.text, marginTop: 2 },
  applicantRole: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  verifiedText: { fontSize: 11, fontWeight: '700', color: colors.success },
  modalActionGroup: { gap: 10, marginTop: 10 },
  modalApproveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.success, padding: 14, borderRadius: 12 },
  modalApproveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalDeclineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.danger, padding: 12, borderRadius: 12 },
  modalDeclineText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  modalRosterLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  modalRosterText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
