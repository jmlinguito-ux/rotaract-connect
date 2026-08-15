import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppNotification, EventInvitation, RotaractEvent } from '../../types';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { DeclineReasonModal } from '../../components/DeclineReasonModal';
import { SwipeableRow } from '../../components/SwipeableRow';
import UserAvatar from '../../components/UserAvatar';
import VerifiedCheck from '../../components/VerifiedCheck';

const ICON: Record<AppNotification['kind'], keyof typeof Ionicons.glyphMap> = {
  VERIFICATION_UPDATE: 'shield-checkmark',
  ROLE_ASSIGNED: 'key',
  INVITATION_RECEIVED: 'mail-unread',
  INVITATION_RESPONSE: 'mail-open',
  JOIN_REQUEST: 'person-add',
  JOIN_APPROVED: 'checkmark-circle',
  EVENT_REMINDER: 'alarm',
  EVENT_UPDATE: 'notifications',
  EVENT_APPROVAL_REQUEST: 'shield-half',
  EVENT_APPROVED: 'checkmark-done',
  MEMBERSHIP_REQUEST: 'people',
  INQUIRY_RECEIVED: 'chatbubble-ellipses',
};

const ICON_COLOR: Record<AppNotification['kind'], string> = {
  VERIFICATION_UPDATE: '#D41367',
  ROLE_ASSIGNED: '#F59E0B',
  INVITATION_RECEIVED: '#3B82F6',
  INVITATION_RESPONSE: '#10B981',
  JOIN_REQUEST: '#F59E0B',
  JOIN_APPROVED: '#10B981',
  EVENT_REMINDER: '#F59E0B',
  EVENT_UPDATE: '#3B82F6',
  EVENT_APPROVAL_REQUEST: '#F59E0B',
  EVENT_APPROVED: '#10B981',
  MEMBERSHIP_REQUEST: '#3B82F6',
  INQUIRY_RECEIVED: '#D41367',
};

/** Group chats shown before the "show all" toggle kicks in. */
const CHATS_PREVIEW = 3;

type Row =
  | { type: 'header'; key: string; label: string; count?: number }
  | { type: 'invite'; key: string; invitation: EventInvitation }
  | { type: 'chat'; key: string; event: RotaractEvent }
  | { type: 'notif'; key: string; notification: AppNotification }
  | { type: 'more'; key: string; label: string; onPress: () => void }
  | { type: 'empty'; key: string; label: string };

export default function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const {
    notificationsFor,
    markNotificationsRead,
    invitations,
    respondInvitation,
    events,
    users,
    conversations,
    canAccessEventGroupChat,
    getOrCreateEventGroupConversation,
    participantsFor,
    deleteNotification,
  } = useData();
  const { colors: themeColors } = useTheme();

  const [inviteDeclineTarget, setInviteDeclineTarget] = useState<{
    invitationId: string;
    inviterName?: string;
    eventTitle?: string;
  } | null>(null);
  const [showAllChats, setShowAllChats] = useState(false);

  const myInvites = user
    ? invitations.filter(i => i.invited_user_id === user.id && i.status === 'PENDING')
    : [];

  const myGroupEvents = user ? events.filter(e => canAccessEventGroupChat(e.id, user.id)) : [];

  // An invitation that is actionable above would otherwise appear a second time as
  // a "You were invited" notification, so only one of the two is shown.
  const notifications = useMemo(() => {
    const all = user ? notificationsFor(user.id) : [];
    const pendingEventIds = new Set(myInvites.map(i => i.event_id));
    return all.filter(n => !(n.kind === 'INVITATION_RECEIVED' && n.event_id && pendingEventIds.has(n.event_id)));
  }, [user, notificationsFor, myInvites]);

  const openGroupChat = (ev: RotaractEvent) => {
    const groupConv = getOrCreateEventGroupConversation(ev.id);
    navigation.navigate('Chat', {
      conversationId: groupConv.id,
      eventId: ev.id,
      recipientId: 'ALL_PARTICIPANTS',
      recipientName: `${ev.title} Group Chat`,
      eventTitle: ev.title,
    });
  };

  const rows: Row[] = [];

  if (myInvites.length > 0) {
    rows.push({ type: 'header', key: 'h_inv', label: 'Invitations', count: myInvites.length });
    myInvites.forEach(inv => rows.push({ type: 'invite', key: `inv_${inv.id}`, invitation: inv }));
  }

  if (myGroupEvents.length > 0) {
    rows.push({ type: 'header', key: 'h_chats', label: 'Event Group Chats', count: myGroupEvents.length });
    const shown = showAllChats ? myGroupEvents : myGroupEvents.slice(0, CHATS_PREVIEW);
    shown.forEach(ev => rows.push({ type: 'chat', key: `chat_${ev.id}`, event: ev }));
    if (myGroupEvents.length > CHATS_PREVIEW) {
      rows.push({
        type: 'more',
        key: 'chats_more',
        label: showAllChats
          ? 'Show fewer'
          : `Show all ${myGroupEvents.length} group chats`,
        onPress: () => setShowAllChats(v => !v),
      });
    }
  }

  rows.push({ type: 'header', key: 'h_notifs', label: 'Notifications & Messages', count: notifications.length || undefined });
  if (notifications.length === 0) {
    rows.push({ type: 'empty', key: 'notifs_empty', label: 'Nothing new here.' });
  } else {
    notifications.forEach(n => rows.push({ type: 'notif', key: `n_${n.id}`, notification: n }));
  }

  const handleNotificationPress = (item: AppNotification) => {
    if (user) markNotificationsRead(user.id);
    if (item.conversation_id) {
      // Resolve the other party from the conversation itself — never from the
      // notification title, which breaks on name collisions or copy changes.
      const conv = conversations.find(c => c.id === item.conversation_id);
      const otherId = conv
        ? (conv.participant_user_id === user?.id ? conv.organizer_user_id : conv.participant_user_id)
        : undefined;
      const other = otherId ? users.find(u => u.id === otherId) : undefined;
      navigation.navigate('Chat', {
        conversationId: item.conversation_id,
        eventId: item.event_id,
        recipientId: other?.id ?? '',
        recipientName: other?.full_name ?? item.title.replace('Inquiry from ', '').trim(),
      });
    } else if (item.event_id) {
      if (item.kind === 'JOIN_APPROVED' && user && canAccessEventGroupChat(item.event_id, user.id)) {
        const ev = events.find(e => e.id === item.event_id);
        if (ev) openGroupChat(ev);
      } else {
        navigation.navigate('EventDetail', { eventId: item.event_id });
      }
    } else if (item.application_id) {
      navigation.navigate('ApplicationReview', { applicationId: item.application_id });
    }
  };

  const renderRow = (row: Row) => {
    switch (row.type) {
      case 'header':
        return (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: themeColors.textMuted }]}>
              {row.label.toUpperCase()}
            </Text>
            {row.count ? (
              <View style={[styles.countPill, { backgroundColor: themeColors.primary + '1A' }]}>
                <Text style={[styles.countPillText, { color: themeColors.primary }]}>{row.count}</Text>
              </View>
            ) : null}
          </View>
        );

      case 'invite': {
        const inv = row.invitation;
        const event = events.find(e => e.id === inv.event_id);
        const inviter = users.find(u => u.id === inv.invited_by_user_id);
        return (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
            activeOpacity={0.8}
            onPress={() => event && navigation.navigate('EventDetail', { eventId: event.id })}
          >
            <View style={styles.cardTopRow}>
              <UserAvatar user={inviter ?? { full_name: 'Rotaractor' }} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: themeColors.text }]} numberOfLines={2}>
                  {event?.title || 'Rotaract Event'}
                </Text>
                <View style={styles.inlineRow}>
                  <Text style={[styles.rowMeta, { color: themeColors.textMuted }]} numberOfLines={1}>
                    {inviter?.full_name || 'A Rotaractor'} invited you
                  </Text>
                  <VerifiedCheck user={inviter} size={12} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </View>

            <View style={styles.inviteBtns}>
              <TouchableOpacity
                style={[styles.acceptBtn, { backgroundColor: themeColors.primary }]}
                onPress={() => user && respondInvitation(inv.id, true, user)}
              >
                <Ionicons name="checkmark" size={14} color="#fff" />
                <Text style={styles.acceptBtnText}>Accept</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.declineBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                onPress={() =>
                  setInviteDeclineTarget({
                    invitationId: inv.id,
                    inviterName: inviter?.full_name,
                    eventTitle: event?.title,
                  })
                }
              >
                <Text style={[styles.declineBtnText, { color: themeColors.text }]}>Decline</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      }

      case 'chat': {
        const ev = row.event;
        const partsCount = participantsFor(ev.id).filter(p => p.status === 'JOINED').length;
        return (
          <TouchableOpacity
            style={[styles.card, styles.cardTopRow, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
            activeOpacity={0.8}
            onPress={() => openGroupChat(ev)}
          >
            <View style={[styles.iconCircle, { backgroundColor: themeColors.primary }]}>
              <Ionicons name="chatbubbles" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: themeColors.text }]} numberOfLines={1}>{ev.title}</Text>
              <Text style={[styles.rowMeta, { color: themeColors.textMuted }]} numberOfLines={1}>
                {partsCount} participants • Tap to chat
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
          </TouchableOpacity>
        );
      }

      case 'more':
        return (
          <TouchableOpacity style={styles.moreBtn} onPress={row.onPress}>
            <Text style={[styles.moreBtnText, { color: themeColors.primary }]}>{row.label}</Text>
          </TouchableOpacity>
        );

      case 'empty':
        return (
          <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>{row.label}</Text>
          </View>
        );

      case 'notif':
        return (
          <SwipeableRow onDelete={() => deleteNotification(row.notification.id)}>
            <NotifRow
              n={row.notification}
              colors={themeColors}
              onPress={() => handleNotificationPress(row.notification)}
            />
          </SwipeableRow>
        );
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Inbox</Text>
        <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>
          Invitations, event chats & notifications
        </Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={r => r.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => renderRow(item)}
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

function NotifRow({ n, colors: c, onPress }: { n: AppNotification; colors: any; onPress: () => void }) {
  const { users } = useData();
  const color = ICON_COLOR[n.kind];
  const isMessage = n.kind === 'INQUIRY_RECEIVED' || !!n.conversation_id;

  // Message notifications are titled "Inquiry from <sender>". `n.user_id` is the
  // recipient, so resolving the sender has to go through the title.
  const senderName = isMessage ? n.title.replace('Inquiry from ', '').trim() : null;
  const senderUser = senderName ? users.find(u => u.full_name === senderName) : undefined;

  const d = new Date(n.created_at);
  const formattedTime = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        styles.cardTopRow,
        {
          backgroundColor: !n.is_read ? c.primary + '0F' : c.cardBg,
          borderColor: !n.is_read ? c.primary + '3D' : c.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {isMessage ? (
        <UserAvatar user={senderUser ?? { full_name: senderName ?? 'User' }} size={38} />
      ) : (
        <View style={[styles.iconCircle, { backgroundColor: color + '22' }]}>
          <Ionicons name={ICON[n.kind]} size={18} color={color} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.inlineRow}>
          <Text style={[styles.rowTitle, { color: c.text, flexShrink: 1 }]} numberOfLines={1}>{n.title}</Text>
          <VerifiedCheck user={senderUser} size={12} />
        </View>
        <Text style={[styles.rowMeta, { color: c.textMuted }]} numberOfLines={2}>{n.message}</Text>
        <Text style={[styles.rowTime, { color: c.textMuted }]}>{formattedTime}</Text>
      </View>
      {!n.is_read && <View style={[styles.unreadDot, { backgroundColor: c.primary }]} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { padding: 20, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  list: { padding: 16, paddingTop: 4, paddingBottom: 32 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  countPill: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, alignItems: 'center' },
  countPillText: { fontSize: 10, fontWeight: '800' },

  card: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowMeta: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  rowTime: { fontSize: 10, marginTop: 3 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },

  inviteBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 10 },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  declineBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  declineBtnText: { fontSize: 13, fontWeight: '700' },

  moreBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 2, marginBottom: 4 },
  moreBtnText: { fontSize: 12, fontWeight: '800' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
});
