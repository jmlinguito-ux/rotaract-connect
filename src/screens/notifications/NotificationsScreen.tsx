import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../../theme/colors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../navigation/types';
import { AppNotification, NotificationKind, EventParticipant, AppUser, RotaractEvent } from '../../types';
import { DeclineReasonModal } from '../../components/DeclineReasonModal';
import { SwipeableRow } from '../../components/SwipeableRow';
import { BottomSheet } from '../../components/BottomSheet';
import UserAvatar from '../../components/UserAvatar';
import { dispatchLocalAlert } from '../../services/emergencyBroadcast';
import { stopAlertSound } from '../../services/sound';

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
  EMERGENCY_BROADCAST: 'warning',
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
  EMERGENCY_BROADCAST: colors.danger,
};

export default function NotificationsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();
  const {
    notificationsFor, markNotificationsRead, deleteNotification, deleteAllNotifications, participantsFor, invitationFor,
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

  const [categoryTab, setCategoryTab] = useState<'ALL' | 'EVENTS' | 'APPROVALS' | 'MESSAGES'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [confirmClearVisible, setConfirmClearVisible] = useState(false);
  const [confirmDeleteAllVisible, setConfirmDeleteAllVisible] = useState(false);

  React.useEffect(() => {
    stopAlertSound();
    if (user) {
      markNotificationsRead(user.id);
    }
  }, [user, markNotificationsRead]);

  if (!user) return null;
  const notifs = notificationsFor(user.id);

  const filteredNotifs = useMemo(() => {
    let list = notifs;

    if (categoryTab === 'EVENTS') {
      const eventKinds: NotificationKind[] = ['EVENT_REMINDER', 'EVENT_UPDATE', 'INVITATION_RECEIVED', 'INVITATION_RESPONSE'];
      list = list.filter(n => eventKinds.includes(n.kind));
    } else if (categoryTab === 'APPROVALS') {
      const approvalKinds: NotificationKind[] = ['JOIN_REQUEST', 'JOIN_APPROVED', 'EVENT_APPROVAL_REQUEST', 'EVENT_APPROVED', 'MEMBERSHIP_REQUEST', 'VERIFICATION_UPDATE', 'ROLE_ASSIGNED'];
      list = list.filter(n => approvalKinds.includes(n.kind));
    } else if (categoryTab === 'MESSAGES') {
      list = list.filter(n => n.kind === 'INQUIRY_RECEIVED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q));
    }

    return list;
  }, [notifs, categoryTab, searchQuery]);

  const readCount = notifs.filter(n => n.is_read).length;

  const handleClearRead = () => {
    const readIds = notifs.filter(n => n.is_read).map(n => n.id);
    readIds.forEach(id => deleteNotification(id));
    setConfirmClearVisible(false);
  };

  const handleDeleteAll = () => {
    if (user) {
      deleteAllNotifications(user.id);
    }
    setConfirmDeleteAllVisible(false);
  };

  const handleRowPress = (item: AppNotification) => {
    if (!item.is_read) {
      markNotificationsRead(item.id);
    }
    if (item.kind === 'EMERGENCY_BROADCAST') {
      const broadcasterName = item.title.replace(/^🚨\s*(?:EMERGENCY\s*SOS|NEARBY\s*EMERGENCY|SOS):\s*/i, '').trim() || 'Rotaract Member in Distress';
      const broadcaster = users.find(u => u.id === item.user_id || (u.full_name && u.full_name.toLowerCase() === broadcasterName.toLowerCase()));

      const clubMatch = item.message.match(/\((Rotaract Club of [^)]+|RC [^)]+|District 3800)\)/i);
      const clubName = clubMatch ? clubMatch[1] : (broadcaster?.club_name || 'District 3800');

      const msgMatch = item.message.match(/"([^"]+)"/);
      const customNote = msgMatch ? msgMatch[1] : '';

      const coordsMatch = item.message.match(/maps\.google\.com\/\?q=([0-9.-]+),([0-9.-]+)/);
      const lat = coordsMatch ? parseFloat(coordsMatch[1]) : 14.6948;
      const lng = coordsMatch ? parseFloat(coordsMatch[2]) : 120.9664;

      const addrMatch = item.message.match(/near\s+(.*?)(?:\.|\"|\s+Map:|\s+Location:|$)/i);
      const addressHint = addrMatch ? addrMatch[1].trim() : (customNote ? 'Coordinates provided' : item.message);

      dispatchLocalAlert({
        id: item.id,
        user_id: broadcaster?.id || item.user_id,
        full_name: broadcaster?.full_name || broadcasterName,
        avatar_url: broadcaster?.avatar_url,
        club_id: broadcaster?.club_id || '',
        club_name: clubName,
        contact_number: broadcaster?.contact_number,
        latitude: lat,
        longitude: lng,
        status: 'ACTIVE',
        map_url: `https://maps.google.com/?q=${lat},${lng}`,
        address_hint: addressHint,
        message: customNote || undefined,
        created_at: item.created_at,
        playSound: false,
      });
      return;
    }
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
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      {/* Top Search & Actions Bar */}
      <View style={styles.topControlContainer}>
        <View style={[styles.searchBox, { backgroundColor: themeColors.surface, borderColor: isSearchFocused ? themeColors.primary : themeColors.border }, isSearchFocused && { borderWidth: 1.5 }]}>
          <Ionicons name="search" size={16} color={isSearchFocused ? themeColors.primary : themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search notifications..."
            placeholderTextColor={themeColors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {notifs.length > 0 && (
          <TouchableOpacity
            style={[styles.clearBtn, { backgroundColor: isNightMode ? themeColors.surface : '#FEF2F2', borderColor: isNightMode ? '#EF444466' : '#FCA5A5' }]}
            onPress={() => setConfirmDeleteAllVisible(true)}
          >
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
            <Text style={[styles.clearBtnText, { color: '#EF4444' }]}>Delete All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category Tabs */}
      <View style={styles.categoryScrollWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPillsRow}>
          <TouchableOpacity
            style={[
              styles.categoryPill,
              {
                backgroundColor: categoryTab === 'ALL' ? themeColors.primary : themeColors.surface,
                borderColor: categoryTab === 'ALL' ? themeColors.primary : themeColors.border,
              },
            ]}
            onPress={() => setCategoryTab('ALL')}
          >
            <Text style={[styles.categoryPillText, { color: categoryTab === 'ALL' ? '#fff' : themeColors.textMuted }]}>
              All ({notifs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.categoryPill,
              {
                backgroundColor: categoryTab === 'EVENTS' ? themeColors.primary : themeColors.surface,
                borderColor: categoryTab === 'EVENTS' ? themeColors.primary : themeColors.border,
              },
            ]}
            onPress={() => setCategoryTab('EVENTS')}
          >
            <Ionicons name="calendar-outline" size={12} color={categoryTab === 'EVENTS' ? '#fff' : themeColors.textMuted} />
            <Text style={[styles.categoryPillText, { color: categoryTab === 'EVENTS' ? '#fff' : themeColors.textMuted }]}>
              Events
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.categoryPill,
              {
                backgroundColor: categoryTab === 'APPROVALS' ? themeColors.primary : themeColors.surface,
                borderColor: categoryTab === 'APPROVALS' ? themeColors.primary : themeColors.border,
              },
            ]}
            onPress={() => setCategoryTab('APPROVALS')}
          >
            <Ionicons name="clipboard-outline" size={12} color={categoryTab === 'APPROVALS' ? '#fff' : themeColors.textMuted} />
            <Text style={[styles.categoryPillText, { color: categoryTab === 'APPROVALS' ? '#fff' : themeColors.textMuted }]}>
              Approvals
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.categoryPill,
              {
                backgroundColor: categoryTab === 'MESSAGES' ? themeColors.primary : themeColors.surface,
                borderColor: categoryTab === 'MESSAGES' ? themeColors.primary : themeColors.border,
              },
            ]}
            onPress={() => setCategoryTab('MESSAGES')}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={12} color={categoryTab === 'MESSAGES' ? '#fff' : themeColors.textMuted} />
            <Text style={[styles.categoryPillText, { color: categoryTab === 'MESSAGES' ? '#fff' : themeColors.textMuted }]}>
              Messages
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <FlatList
        data={filteredNotifs}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>
            {searchQuery ? 'No notifications match your search' : 'No notifications in this category'}
          </Text>
        }
        renderItem={({ item }) => {
          const pendingParticipants = item.kind === 'JOIN_REQUEST' && item.event_id ? participantsFor(item.event_id).filter(p => p.status === 'PENDING') : [];
          const pendingInvitation = item.kind === 'INVITATION_RECEIVED' && item.event_id ? invitationFor(item.event_id, user.id) : undefined;
          const ev = item.event_id ? events.find(e => e.id === item.event_id) : undefined;

          return (
            <SwipeableRow onDelete={() => deleteNotification(item.id)}>
              <TouchableOpacity
                style={[
                  styles.notifRow,
                  { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
                  !item.is_read && [styles.unread, { backgroundColor: isNightMode ? themeColors.cardBg : '#FDF2F7', borderColor: isNightMode ? themeColors.primary : '#F9D6E5' }],
                ]}
                onPress={() => handleRowPress(item)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconWrap, { backgroundColor: ICON_COLOR[item.kind] + '20' }]}>
                  <Ionicons name={ICON[item.kind]} size={20} color={ICON_COLOR[item.kind]} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.title, { color: themeColors.text }]}>{item.title}</Text>
                    {item.kind === 'JOIN_REQUEST' && (
                      <View style={styles.badgePill}>
                        <Text style={styles.badgeText}>Review Needed</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.msg, { color: themeColors.textMuted }]}>{item.message}</Text>
                  <Text style={[styles.time, { color: themeColors.textMuted }]}>{new Date(item.created_at).toLocaleString()}</Text>

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
      />

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
            <View style={[styles.eventContextCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.eventContextLabel, { color: themeColors.primary }]}>Event</Text>
              <Text style={[styles.eventContextTitle, { color: themeColors.text }]}>{reviewModalData.event?.title}</Text>
              <Text style={[styles.eventContextSub, { color: themeColors.textMuted }]}>
                {reviewModalData.event?.city} • {new Date(reviewModalData.event?.start_datetime ?? '').toLocaleDateString()}
              </Text>
            </View>

            <View style={[styles.applicantCard, { backgroundColor: isNightMode ? themeColors.cardBg : '#FDF2F7', borderColor: isNightMode ? themeColors.border : '#F9D6E5' }]}>
              <UserAvatar
                user={{ full_name: reviewModalData.applicant?.full_name ?? '' }}
                size={48}
              />

              <View style={{ flex: 1 }}>
                <Text style={[styles.applicantName, { color: themeColors.text }]}>{reviewModalData.applicant?.full_name}</Text>
                <Text style={[styles.applicantMeta, { color: themeColors.text }]}>
                  {reviewModalData.applicant?.club_name}
                </Text>
                <Text style={[styles.applicantRole, { color: themeColors.textMuted }]}>
                  Position: {reviewModalData.applicant?.position}
                </Text>
                <View style={styles.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                  <Text style={styles.verifiedText}>Verified Rotaractor</Text>
                </View>
              </View>
            </View>

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

      <DeclineReasonModal
        visible={!!declineTarget}
        applicantName={declineTarget?.applicantName}
        eventTitle={declineTarget?.eventTitle}
        onConfirm={handleConfirmDecline}
        onCancel={() => setDeclineTarget(null)}
      />

      <DeclineReasonModal
        visible={!!inviteDeclineTarget}
        title="Decline Event Invitation"
        description={inviteDeclineTarget ? `Decline invitation from ${inviteDeclineTarget.inviterName || 'organizer'} for "${inviteDeclineTarget.eventTitle || 'event'}"? This is optional.` : undefined}
        onConfirm={reason => {
          if (!inviteDeclineTarget) return;
          respondInvitation(inviteDeclineTarget.invitationId, false, user, reason);
          setInviteDeclineTarget(null);
          Alert.alert('Invitation Declined', 'Your response has been sent to the organizer.');
        }}
        onCancel={() => setInviteDeclineTarget(null)}
      />

      {/* Confirm Clear Read Notifications Dialog */}
      <ConfirmDialog
        visible={confirmClearVisible}
        title="Clear Read Notifications?"
        message={`Are you sure you want to clear ${readCount} read notification${readCount === 1 ? '' : 's'}? Unread notifications will remain in your inbox.`}
        confirmLabel="Clear Read"
        destructive
        onConfirm={handleClearRead}
        onClose={() => setConfirmClearVisible(false)}
      />

      {/* Confirm Delete All Notifications Dialog */}
      <ConfirmDialog
        visible={confirmDeleteAllVisible}
        title="Delete All Notifications?"
        message={`Are you sure you want to delete all ${notifs.length} notification${notifs.length === 1 ? '' : 's'}? This action cannot be undone.`}
        confirmLabel="Delete All"
        destructive
        onConfirm={handleDeleteAll}
        onClose={() => setConfirmDeleteAllVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topControlContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 42, borderRadius: 12, borderWidth: 1 },
  clearBtnText: { fontSize: 12, fontWeight: '700' },
  categoryScrollWrap: { marginBottom: 8 },
  categoryPillsRow: { paddingHorizontal: 16, gap: 8 },
  categoryPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  categoryPillText: { fontSize: 12, fontWeight: '700' },
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
