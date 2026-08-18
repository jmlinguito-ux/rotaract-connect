import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppNotification, EventInvitation, RotaractEvent, Conversation, DirectMessage, ConversationState } from '../../types';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppRefreshControl } from '../../hooks/useAppRefreshControl';
import { DeclineReasonModal } from '../../components/DeclineReasonModal';
import { SwipeableRow, SwipeAction } from '../../components/SwipeableRow';
import UserAvatar from '../../components/UserAvatar';
import VerifiedCheck from '../../components/VerifiedCheck';
import { relativeTime } from '../../utils/relativeTime';

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

type Tab = 'notifications' | 'messages' | 'chats';

/** True when the thread is hidden by a delete-for-me and no newer message revived it. */
function hiddenByDelete(state: ConversationState | undefined, last?: DirectMessage): boolean {
  if (!state?.deleted_at) return false;
  if (!last) return true;
  return new Date(last.created_at).getTime() <= new Date(state.deleted_at).getTime();
}

export default function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const {
    notificationsFor,
    markNotificationsRead,
    markNotificationRead,
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
    conversationStateFor,
    setConversationPinned,
    setConversationArchived,
    deleteConversationForMe,
  } = useData();
  const { colors: themeColors } = useTheme();
  const refreshControl = useAppRefreshControl();

  const [tab, setTab] = useState<Tab>('notifications');
  const [showArchived, setShowArchived] = useState(false);
  const [inviteDeclineTarget, setInviteDeclineTarget] = useState<{
    invitationId: string;
    inviterName?: string;
    eventTitle?: string;
  } | null>(null);

  const myInvites = user
    ? invitations.filter(i => i.invited_user_id === user.id && i.status === 'PENDING')
    : [];

  const myGroupEvents = user ? events.filter(e => canAccessEventGroupChat(e.id, user.id)) : [];

  // Notifications tab: everything that isn't a 1-on-1 DM thread. An actionable
  // invitation shown as its own card is not also listed as a notification. Group
  // broadcast notifications stay and open the group chat when tapped.
  const notifications = useMemo(() => {
    const all = user ? notificationsFor(user.id) : [];
    const pendingEventIds = new Set(myInvites.map(i => i.event_id));
    const groupConvIds = new Set(conversations.filter(c => c.is_group).map(c => c.id));
    return all
      .filter(n =>
        n.kind !== 'INQUIRY_RECEIVED' &&
        (!n.conversation_id || groupConvIds.has(n.conversation_id)) &&
        !(n.kind === 'INVITATION_RECEIVED' && n.event_id && pendingEventIds.has(n.event_id)),
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [user, notificationsFor, myInvites, conversations]);

  // One thread per 1-on-1 conversation, enriched with the user's own pin/archive/
  // delete state. Newest first within each group.
  const allDMs = useMemo(() => {
    if (!user) return [];
    return conversations
      .filter(c => !c.is_group && (c.participant_user_id === user.id || c.organizer_user_id === user.id))
      .map(c => {
        const msgs = messagesForConversation(c.id, user.id);
        const last = msgs[msgs.length - 1];
        const state = conversationStateFor(c.id);
        return { conv: c, last, state };
      })
      .filter(x => !!x.last) // no thread until at least one message exists
      .sort((a, b) => new Date(b.last!.created_at).getTime() - new Date(a.last!.created_at).getTime());
  }, [user, conversations, messagesForConversation, conversationStateFor]);

  // Visible messages: drop deleted (unless a newer message revived) and archived.
  // Pinned float to the top, each subgroup already newest-first.
  const { messagesList, archivedList } = useMemo(() => {
    const live = allDMs.filter(x => !hiddenByDelete(x.state, x.last));
    const active = live.filter(x => !x.state?.archived);
    const pinned = active.filter(x => x.state?.pinned);
    const rest = active.filter(x => !x.state?.pinned);
    const archived = live.filter(x => x.state?.archived);
    return { messagesList: [...pinned, ...rest], archivedList: archived };
  }, [allDMs]);

  const dmUnreadCount = useMemo(() => {
    if (!user) return 0;
    return messagesList.filter(({ conv, last }) => {
      if (!last || last.sender_id === user.id) return false;
      const cursor = readCursorsFor(conv.id).find(c => c.user_id === user.id);
      return !cursor || new Date(last.created_at).getTime() > new Date(cursor.last_read_at).getTime();
    }).length;
  }, [user, messagesList, readCursorsFor]);

  const groupChatUnreadCount = useMemo(() => {
    if (!user) return 0;
    return myGroupEvents.filter(ev => {
      const groupConv = conversations.find(c => c.event_id === ev.id && c.is_group);
      if (!groupConv) return false;
      const msgs = messagesForConversation(groupConv.id, user.id);
      if (msgs.length === 0) return false;
      const last = msgs[msgs.length - 1];
      if (!last || last.sender_id === user.id) return false;
      const cursor = readCursorsFor(groupConv.id).find(c => c.user_id === user.id);
      const cursorTime = cursor ? new Date(cursor.last_read_at).getTime() : 0;
      return msgs.some(m => m.sender_id !== user.id && new Date(m.created_at).getTime() > cursorTime);
    }).length;
  }, [user, myGroupEvents, conversations, messagesForConversation, readCursorsFor]);

  const notifUnreadCount = notifications.filter(n => !n.is_read).length;

  const openDM = (conversationId: string) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || !user) return;
    const otherId = conv.participant_user_id === user.id ? conv.organizer_user_id : conv.participant_user_id;
    const other = otherId ? users.find(u => u.id === otherId) : undefined;
    markConversationRead(conversationId, user.id);
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
    if (user) markConversationRead(groupConv.id, user.id);
    navigation.navigate('Chat', {
      conversationId: groupConv.id,
      eventId: ev.id,
      recipientId: 'ALL_PARTICIPANTS',
      recipientName: `${ev.title} Group Chat`,
      eventTitle: ev.title,
    });
  };

  const handleNotificationPress = (item: AppNotification) => {
    if (user && !item.is_read) markNotificationRead(item.id);
    if (item.conversation_id) {
      const conv = conversations.find(c => c.id === item.conversation_id);
      if (conv?.is_group) {
        navigation.navigate('Chat', {
          conversationId: conv.id,
          eventId: conv.event_id,
          recipientId: 'ALL_PARTICIPANTS',
          recipientName: `${conv.event_title ?? 'Event'} Group Chat`,
          eventTitle: conv.event_title,
        });
        return;
      }
      if (!conv && item.event_id) {
        const ev = events.find(e => e.id === item.event_id);
        if (ev) { openGroupChat(ev); return; }
      }
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

  // ---- Renderers -----------------------------------------------------------

  const renderInvite = (inv: EventInvitation) => {
    const event = events.find(e => e.id === inv.event_id);
    const inviter = users.find(u => u.id === inv.invited_by_user_id);
    return (
      <TouchableOpacity
        key={`inv_${inv.id}`}
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
  };

  const renderDM = (entry: { conv: Conversation; last?: DirectMessage; state?: ConversationState }, archived: boolean) => {
    const { conv, last, state } = entry;
    if (!conv || !user) return null;
    const otherId = conv.participant_user_id === user.id ? conv.organizer_user_id : conv.participant_user_id;
    const other = otherId ? users.find(u => u.id === otherId) : undefined;
    const name = other?.full_name ?? conv.participant_name ?? 'Rotaractor';
    const isMine = last?.sender_id === user.id;
    const cursor = readCursorsFor(conv.id).find(c => c.user_id === user.id);
    const unread = !archived && !!last && !isMine && (!cursor || new Date(last.created_at).getTime() > new Date(cursor.last_read_at).getTime());
    const previewText = last
      ? (last.deleted_at ? 'This message was deleted' : (last.attachment_path && !last.text ? '📷 Photo' : last.text))
      : 'Say hi 👋';
    const preview = `${isMine ? 'You: ' : ''}${previewText}`;
    const pinned = !!state?.pinned;

    const actions: SwipeAction[] = archived
      ? [
          { key: 'unarchive', label: 'Unarchive', icon: 'archive-outline', color: themeColors.info, onPress: () => setConversationArchived(conv.id, user.id, false) },
          { key: 'delete', label: 'Delete', icon: 'trash-outline', color: themeColors.danger, onPress: () => deleteConversationForMe(conv.id, user.id), destructive: true },
        ]
      : [
          { key: 'pin', label: pinned ? 'Unpin' : 'Pin', icon: pinned ? 'star' : 'star-outline', color: themeColors.secondary, onPress: () => setConversationPinned(conv.id, user.id, !pinned) },
          { key: 'archive', label: 'Archive', icon: 'archive-outline', color: themeColors.info, onPress: () => setConversationArchived(conv.id, user.id, true) },
          { key: 'delete', label: 'Delete', icon: 'trash-outline', color: themeColors.danger, onPress: () => deleteConversationForMe(conv.id, user.id), destructive: true },
        ];

    return (
      <SwipeableRow key={`dm_${conv.id}`} actions={actions}>
        <TouchableOpacity
          style={[
            styles.card, styles.cardTopRow, styles.swipeCard,
            { backgroundColor: unread ? themeColors.primary + '0F' : themeColors.cardBg, borderColor: unread ? themeColors.primary + '3D' : themeColors.border },
          ]}
          activeOpacity={0.8}
          onPress={() => openDM(conv.id)}
        >
          <UserAvatar user={other ?? { full_name: name }} size={44} />
          <View style={{ flex: 1 }}>
            <View style={styles.dmTopRow}>
              <View style={[styles.inlineRow, { flexShrink: 1 }]}>
                {pinned && <Ionicons name="star" size={12} color={themeColors.secondary} />}
                <Text style={[styles.rowTitle, { color: themeColors.text, flexShrink: 1 }]} numberOfLines={1}>{name}</Text>
                <VerifiedCheck user={other} size={12} />
              </View>
              {last ? <Text style={[styles.rowTime, { color: themeColors.textMuted }]}>{relativeTime(last.created_at)}</Text> : null}
            </View>
            <Text
              style={[styles.rowMeta, { color: unread ? themeColors.text : themeColors.textMuted, fontWeight: unread ? '700' : '400' }]}
              numberOfLines={1}
            >
              {preview}
            </Text>
          </View>
          {unread && <View style={[styles.unreadDot, { backgroundColor: themeColors.primary, alignSelf: 'center' }]} />}
        </TouchableOpacity>
      </SwipeableRow>
    );
  };

  const renderGroupChat = (ev: RotaractEvent) => {
    const groupConv = conversations.find(c => c.event_id === ev.id && c.is_group);
    const msgs = groupConv ? messagesForConversation(groupConv.id, user?.id) : [];
    const last = msgs[msgs.length - 1];
    const partsCount = participantsFor(ev.id).filter(p => p.status === 'JOINED').length;
    const archived = ev.status === 'COMPLETED' || ev.status === 'CANCELLED';

    let unreadCount = 0;
    if (groupConv && user && last) {
      const cursor = readCursorsFor(groupConv.id).find(c => c.user_id === user.id);
      const cursorTime = cursor ? new Date(cursor.last_read_at).getTime() : 0;
      unreadCount = msgs.filter(m => m.sender_id !== user.id && new Date(m.created_at).getTime() > cursorTime).length;
    }

    const senderName = last ? (last.sender_id === user?.id ? 'You' : (last.sender_name || 'Someone').split(' ')[0]) : undefined;
    const lastPreview = last
      ? (last.deleted_at ? 'This message was deleted' : (last.attachment_path && !last.text ? '📷 Photo' : last.text))
      : `${partsCount} participant${partsCount === 1 ? '' : 's'} • Tap to chat`;

    return (
      <TouchableOpacity
        key={`chat_${ev.id}`}
        style={[styles.card, styles.cardTopRow, { backgroundColor: unreadCount ? themeColors.primary + '0F' : themeColors.cardBg, borderColor: unreadCount ? themeColors.primary + '3D' : themeColors.border }]}
        activeOpacity={0.8}
        onPress={() => openGroupChat(ev)}
      >
        <View style={[styles.iconCircle, { backgroundColor: archived ? themeColors.textMuted : themeColors.primary }]}>
          <Ionicons name={archived ? 'archive' : 'chatbubbles'} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.dmTopRow}>
            <View style={[styles.inlineRow, { flexShrink: 1 }]}>
              <Text style={[styles.rowTitle, { color: themeColors.text, flexShrink: 1 }]} numberOfLines={1}>{ev.title}</Text>
              {archived && (
                <View style={[styles.archivedPill, { backgroundColor: themeColors.textMuted + '22' }]}>
                  <Text style={[styles.archivedPillText, { color: themeColors.textMuted }]}>Archived</Text>
                </View>
              )}
            </View>
            {last ? <Text style={[styles.rowTime, { color: themeColors.textMuted }]}>{relativeTime(last.created_at)}</Text> : null}
          </View>
          <Text style={[styles.rowMeta, { color: unreadCount ? themeColors.text : themeColors.textMuted, fontWeight: unreadCount ? '700' : '400' }]} numberOfLines={1}>
            {senderName ? `${senderName}: ${lastPreview}` : lastPreview}
          </Text>
        </View>
        {unreadCount > 0 ? (
          <View style={[styles.countBadge, { backgroundColor: themeColors.primary }]}>
            <Text style={styles.countBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
        )}
      </TouchableOpacity>
    );
  };

  const emptyState = (icon: keyof typeof Ionicons.glyphMap, label: string) => (
    <View style={styles.emptyWrap}>
      <Ionicons name={icon} size={40} color={themeColors.textMuted} />
      <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>{label}</Text>
    </View>
  );

  // ---- Tab bodies (as FlatList data so scrolling + pull-to-refresh work) ----

  type Row = { key: string; render: () => React.ReactNode };
  const rows: Row[] = [];

  if (tab === 'notifications') {
    if (myInvites.length > 0) {
      rows.push({ key: 'h_inv', render: () => <SectionHeader label="Invitations" count={myInvites.length} colors={themeColors} /> });
      myInvites.forEach(inv => rows.push({ key: `inv_${inv.id}`, render: () => renderInvite(inv) }));
    }
    if (notifications.length === 0 && myInvites.length === 0) {
      rows.push({ key: 'notif_empty', render: () => emptyState('notifications-off-outline', 'No notifications yet.') });
    } else {
      notifications.forEach(n => rows.push({
        key: `n_${n.id}`,
        render: () => (
          <SwipeableRow onDelete={() => deleteNotification(n.id)}>
            <NotifRow n={n} colors={themeColors} onPress={() => handleNotificationPress(n)} />
          </SwipeableRow>
        ),
      }));
    }
  } else if (tab === 'messages') {
    if (messagesList.length === 0 && archivedList.length === 0) {
      rows.push({ key: 'msg_empty', render: () => emptyState('chatbubbles-outline', 'No messages yet.') });
    } else {
      messagesList.forEach(entry => rows.push({ key: `dm_${entry.conv.id}`, render: () => renderDM(entry, false) }));
      if (messagesList.length === 0) {
        rows.push({ key: 'msg_all_archived', render: () => emptyState('chatbubbles-outline', 'No active conversations.') });
      }
      if (archivedList.length > 0) {
        rows.push({
          key: 'archived_toggle',
          render: () => (
            <TouchableOpacity style={styles.archivedToggle} onPress={() => setShowArchived(v => !v)} activeOpacity={0.7}>
              <Ionicons name="archive-outline" size={16} color={themeColors.textMuted} />
              <Text style={[styles.archivedToggleText, { color: themeColors.textMuted }]}>
                Archived ({archivedList.length})
              </Text>
              <Ionicons name={showArchived ? 'chevron-up' : 'chevron-down'} size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          ),
        });
        if (showArchived) {
          archivedList.forEach(entry => rows.push({ key: `arch_${entry.conv.id}`, render: () => renderDM(entry, true) }));
        }
      }
    }
  } else {
    if (myGroupEvents.length === 0) {
      rows.push({ key: 'chats_empty', render: () => emptyState('chatbubbles-outline', 'No event group chats yet.\nJoin an event to start collaborating.') });
    } else {
      // Order by latest activity: group chats with recent messages float up.
      const ordered = [...myGroupEvents].sort((a, b) => {
        const la = conversations.find(c => c.event_id === a.id && c.is_group);
        const lb = conversations.find(c => c.event_id === b.id && c.is_group);
        const ta = la ? new Date(la.last_message_at).getTime() : 0;
        const tb = lb ? new Date(lb.last_message_at).getTime() : 0;
        return tb - ta;
      });
      ordered.forEach(ev => rows.push({ key: `chat_${ev.id}`, render: () => renderGroupChat(ev) }));
    }
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'notifications', label: 'Notifications', count: notifUnreadCount > 0 ? notifUnreadCount : undefined },
    { key: 'messages', label: 'Messages', count: dmUnreadCount > 0 ? dmUnreadCount : undefined },
    { key: 'chats', label: 'Group Chats', count: groupChatUnreadCount > 0 ? groupChatUnreadCount : undefined },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Inbox</Text>
      </View>

      <View style={styles.pillRow}>
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.pill,
                { backgroundColor: active ? themeColors.primary : themeColors.surface, borderColor: active ? themeColors.primary : themeColors.border },
              ]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.pillText, { color: active ? '#fff' : themeColors.textMuted }]} numberOfLines={1}>
                {t.label}
              </Text>
              {t.count ? (
                <View style={[styles.pillBadge, { backgroundColor: active ? 'rgba(255,255,255,0.28)' : themeColors.primary }]}>
                  <Text style={[styles.pillBadgeText, { color: '#fff' }]}>{t.count > 99 ? '99+' : t.count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={rows}
        keyExtractor={r => r.key}
        refreshControl={refreshControl}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <>{item.render()}</>}
        keyboardShouldPersistTaps="handled"
      />

      <DeclineReasonModal
        visible={!!inviteDeclineTarget}
        title="Decline Invitation"
        description={`Let ${inviteDeclineTarget?.inviterName ?? 'the organizer'} know why you can't join${inviteDeclineTarget?.eventTitle ? ` "${inviteDeclineTarget.eventTitle}"` : ''}. This is optional.`}
        onConfirm={reason => {
          if (user && inviteDeclineTarget) {
            respondInvitation(inviteDeclineTarget.invitationId, false, user, reason);
            setInviteDeclineTarget(null);
          }
        }}
        onCancel={() => setInviteDeclineTarget(null)}
      />
    </SafeAreaView>
  );
}

function SectionHeader({ label, count, colors }: { label: string; count?: number; colors: any }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      {count ? (
        <View style={[styles.countPill, { backgroundColor: colors.primary + '1A' }]}>
          <Text style={[styles.countPillText, { color: colors.primary }]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function NotifRow({ n, colors: c, onPress }: { n: AppNotification; colors: any; onPress: () => void }) {
  const { users } = useData();
  const color = ICON_COLOR[n.kind];
  const isMessage = n.kind === 'INQUIRY_RECEIVED' || !!n.conversation_id;

  const senderName = isMessage ? n.title.replace('Inquiry from ', '').trim() : null;
  const senderUser = senderName ? users.find(u => u.full_name === senderName) : undefined;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        styles.cardTopRow,
        styles.swipeCard,
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
        {/* Top row: source/title left, relative timestamp upper-right. */}
        <View style={styles.dmTopRow}>
          <View style={[styles.inlineRow, { flexShrink: 1 }]}>
            <Text style={[styles.rowTitle, { color: c.text, flexShrink: 1 }]} numberOfLines={1}>{n.title}</Text>
            <VerifiedCheck user={senderUser} size={12} />
          </View>
          <Text style={[styles.rowTime, { color: c.textMuted }]}>{relativeTime(n.created_at)}</Text>
        </View>
        {/* Bottom row: content preview. */}
        <Text style={[styles.rowMeta, { color: c.textMuted }]} numberOfLines={2}>{n.message}</Text>
      </View>
      {!n.is_read && <View style={[styles.unreadDot, { backgroundColor: c.primary, alignSelf: 'center' }]} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  list: { padding: 16, paddingTop: 8, paddingBottom: 32 },

  pillRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1,
  },
  pillText: { fontSize: 12.5, fontWeight: '700' },
  pillBadge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pillBadgeText: { fontSize: 10, fontWeight: '800' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  countPill: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, alignItems: 'center' },
  countPillText: { fontSize: 10, fontWeight: '800' },

  card: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  // Cards wrapped in a SwipeableRow drop their own bottom margin so the revealed
  // Pin/Archive/Delete buttons line up exactly with the card height; the
  // SwipeableRow container supplies the inter-row spacing instead.
  swipeCard: { marginBottom: 0 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowMeta: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  rowTime: { fontSize: 10, marginLeft: 8 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dmTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  countBadge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  archivedPill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  archivedPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  archivedToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 4 },
  archivedToggleText: { fontSize: 12, fontWeight: '700' },

  inviteBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 10 },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  declineBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  declineBtnText: { fontSize: 13, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
