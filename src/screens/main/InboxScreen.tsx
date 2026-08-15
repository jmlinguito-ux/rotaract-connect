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
import { useAppRefreshControl } from '../../hooks/useAppRefreshControl';
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
  | { type: 'dm'; key: string; conversationId: string }
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
    messagesForConversation,
    readCursorsFor,
    markConversationRead,
  } = useData();
  const { colors: themeColors } = useTheme();
  const refreshControl = useAppRefreshControl();

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
  // a "You were invited" notification, so only one of the two is shown. Direct
  // messages are no longer listed as individual notification rows — they collapse
  // into the live conversation threads below (see `myDMs`).
  const notifications = useMemo(() => {
    const all = user ? notificationsFor(user.id) : [];
    const pendingEventIds = new Set(myInvites.map(i => i.event_id));
    return all.filter(n =>
      n.kind !== 'INQUIRY_RECEIVED' && !n.conversation_id &&
      !(n.kind === 'INVITATION_RECEIVED' && n.event_id && pendingEventIds.has(n.event_id)),
    );
  }, [user, notificationsFor, myInvites]);

  // One live thread per 1-on-1 conversation the user is part of, newest first —
  // the last message updates in place instead of piling up a row per message.
  const myDMs = useMemo(() => {
    if (!user) return [];
    return conversations
      .filter(c => !c.is_group && (c.participant_user_id === user.id || c.organizer_user_id === user.id))
      .map(c => {
        const msgs = messagesForConversation(c.id);
        return { conv: c, last: msgs[msgs.length - 1] };
      })
      .filter(x => !!x.last)
      .sort((a, b) => new Date(b.last!.created_at).getTime() - new Date(a.last!.created_at).getTime());
  }, [user, conversations, messagesForConversation]);

  const dmUnreadCount = useMemo(() => {
    if (!user) return 0;
    return myDMs.filter(({ conv, last }) => {
      if (!last || last.sender_id === user.id) return false;
      const cursor = readCursorsFor(conv.id).find(c => c.user_id === user.id);
      return !cursor || new Date(last.created_at).getTime() > new Date(cursor.last_read_at).getTime();
    }).length;
  }, [user, myDMs, readCursorsFor]);

  const openDM = (conversationId: string) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || !user) return;
    const otherId = conv.participant_user_id === user.id ? conv.organizer_user_id : conv.participant_user_id;
    const other = otherId ? users.find(u => u.id === otherId) : undefined;
    // Clear this thread's unread state; also flip the notification badge like the
    // rest of the Inbox does on open.
    markConversationRead(conversationId, user.id);
    markNotificationsRead(user.id);
    navigation.navigate('Chat', {
      conversationId,
      eventId: conv.event_id,
      recipientId: otherId ?? '',
      recipientName: other?.full_name ?? conv.participant_name ?? 'Rotaractor',
      eventTitle: conv.event_title,
    });
  };

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

  if (myDMs.length > 0) {
    rows.push({ type: 'header', key: 'h_dms', label: 'Messages', count: dmUnreadCount || undefined });
    myDMs.forEach(({ conv }) => rows.push({ type: 'dm', key: `dm_${conv.id}`, conversationId: conv.id }));
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

  rows.push({ type: 'header', key: 'h_notifs', label: 'Notifications', count: notifications.length || undefined });
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
        const archived = ev.status === 'COMPLETED' || ev.status === 'CANCELLED';
        return (
          <TouchableOpacity
            style={[styles.card, styles.cardTopRow, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
            activeOpacity={0.8}
            onPress={() => openGroupChat(ev)}
          >
            <View style={[styles.iconCircle, { backgroundColor: archived ? themeColors.textMuted : themeColors.primary }]}>
              <Ionicons name={archived ? 'archive' : 'chatbubbles'} size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.inlineRow}>
                <Text style={[styles.rowTitle, { color: themeColors.text, flexShrink: 1 }]} numberOfLines={1}>{ev.title}</Text>
                {archived && (
                  <View style={[styles.archivedPill, { backgroundColor: themeColors.textMuted + '22' }]}>
                    <Text style={[styles.archivedPillText, { color: themeColors.textMuted }]}>Archived</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.rowMeta, { color: themeColors.textMuted }]} numberOfLines={1}>
                {partsCount} participants • {archived ? 'Read-only' : 'Tap to chat'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
          </TouchableOpacity>
        );
      }

      case 'dm': {
        const conv = conversations.find(c => c.id === row.conversationId);
        if (!conv || !user) return null;
        const otherId = conv.participant_user_id === user.id ? conv.organizer_user_id : conv.participant_user_id;
        const other = otherId ? users.find(u => u.id === otherId) : undefined;
        const name = other?.full_name ?? conv.participant_name ?? 'Rotaractor';
        const msgs = messagesForConversation(conv.id);
        const last = msgs[msgs.length - 1];
        const isMine = last?.sender_id === user.id;
        const cursor = readCursorsFor(conv.id).find(c => c.user_id === user.id);
        const unread = !!last && !isMine && (!cursor || new Date(last.created_at).getTime() > new Date(cursor.last_read_at).getTime());
        const previewText = last
          ? (last.attachment_path && !last.text ? '📷 Photo' : last.text)
          : 'Say hi 👋';
        const preview = `${isMine ? 'You: ' : ''}${previewText}`;
        const when = last ? new Date(last.created_at) : undefined;
        const timeStr = when
          ? (Date.now() - when.getTime() < 86400000
              ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : when.toLocaleDateString([], { month: 'short', day: 'numeric' }))
          : '';
        return (
          <TouchableOpacity
            style={[
              styles.card, styles.cardTopRow,
              { backgroundColor: unread ? themeColors.primary + '0F' : themeColors.cardBg, borderColor: unread ? themeColors.primary + '3D' : themeColors.border },
            ]}
            activeOpacity={0.8}
            onPress={() => openDM(conv.id)}
          >
            <UserAvatar user={other ?? { full_name: name }} size={44} />
            <View style={{ flex: 1 }}>
              <View style={styles.dmTopRow}>
                <View style={styles.inlineRow}>
                  <Text style={[styles.rowTitle, { color: themeColors.text, flexShrink: 1 }]} numberOfLines={1}>{name}</Text>
                  <VerifiedCheck user={other} size={12} />
                </View>
                {timeStr ? <Text style={[styles.rowTime, { color: themeColors.textMuted }]}>{timeStr}</Text> : null}
              </View>
              <Text
                style={[styles.rowMeta, { color: unread ? themeColors.text : themeColors.textMuted, fontWeight: unread ? '700' : '400' }]}
                numberOfLines={1}
              >
                {preview}
              </Text>
            </View>
            {unread && <View style={[styles.unreadDot, { backgroundColor: themeColors.primary, alignSelf: 'center', marginTop: 0 }]} />}
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
        refreshControl={refreshControl}
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
  dmTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
  archivedPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  archivedPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  inviteBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 10 },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  declineBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  declineBtnText: { fontSize: 13, fontWeight: '700' },

  moreBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 2, marginBottom: 4 },
  moreBtnText: { fontSize: 12, fontWeight: '800' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
});
