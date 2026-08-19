import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { AppState, View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Platform, Image, Alert, ActivityIndicator, Keyboard, KeyboardAvoidingView, Clipboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import UserAvatar from '../../components/UserAvatar';
import VerifiedCheck from '../../components/VerifiedCheck';
import FullImageModal from '../../components/FullImageModal';
import { SwipeableRow } from '../../components/SwipeableRow';
import { BottomSheet } from '../../components/BottomSheet';
import { UserProfileModal } from '../../components/UserProfileModal';
import { useChatPresence } from '../../hooks/useChatPresence';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { uploadImageAsset } from '../../services/storage';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { canMessageUser, inquiryBlockedMessage } from '../../utils/messaging';
import { useToast } from '../../context/ToastContext';
import RotaractNotifications from '../../../modules/rotaract-notifications';
import { formatTime } from '../../utils/timeFormat';
import { DirectMessage } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

// Colour for the "read" double-check — a light blue that stays legible on the
// primary-coloured outgoing bubble.
const READ_TICK_COLOR = '#8ED2FF';

export default function ChatScreen({ route, navigation }: Props) {
  const { conversationId, eventId, recipientId, recipientName, eventTitle } = route.params;
  const { user } = useAuth();
  const {
    messagesForConversation, sendDirectMessage, retryMessage, deleteMessageForMe, unsendMessage, events, users, participantsFor,
    getOrCreateConversation, markConversationRead, readCursorsFor, conversationStateFor, setConversationMuted, conversations,
    reactionsFor, toggleMessageReaction,
  } = useData();
  const { colors: themeColors, isNightMode } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const isFocused = useIsFocused();
  const listRef = useRef<FlatList>(null);
  // In an inverted list, y=0 is the newest message at the bottom.
  const atBottom = useRef(true);
  const [showNewMsgPill, setShowNewMsgPill] = useState(false);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset } = e.nativeEvent;
    const isAtBottom = contentOffset.y < 50;
    atBottom.current = isAtBottom;
    if (isAtBottom) {
      setShowNewMsgPill(false);
    }
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSub = Keyboard.addListener(showEvt, () => {
      if (atBottom.current) {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
    return () => { showSub.remove(); };
  }, []);

  const [text, setText] = useState('');
  const [selectedUserModal, setSelectedUserModal] = useState<any>(null);
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Message being replied to / quoted in the composer.
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  // Message whose "Seen by …" detail is expanded (tap to toggle, group chats).
  const [expandedSeenId, setExpandedSeenId] = useState<string | null>(null);
  // Message long-pressed to open the action menu (reactions, reply, delete for me / unsend).
  const [actionMsg, setActionMsg] = useState<DirectMessage | null>(null);
  // Mentions confirmed by tapping a member. Kept as ids so a rename never breaks
  // targeting, and re-checked against the text on send so deleting the name drops it.
  const [mentions, setMentions] = useState<{ id: string; full_name: string }[]>([]);
  // Refusal notice, shown instead of letting the write fail into the sync banner.
  const [blockedName, setBlockedName] = useState<string | null>(null);
  // Explains the read-only composer when the notice is tapped.
  const [reasonVisible, setReasonVisible] = useState(false);

  // Memoised: messagesForConversation returns a NEW array each call, so calling it
  // inline gave FlatList a fresh `data` identity on every render — including ones
  // caused by typing indicators and presence, which re-rendered the whole list.
  const messages = useMemo(
    () => messagesForConversation(conversationId, user?.id),
    [messagesForConversation, conversationId, user?.id],
  );
  // Inverted list requires newest items first at index 0.
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);
  const currentConv = conversations.find(c => c.id === conversationId);
  const isGroupChat = recipientId === 'ALL_PARTICIPANTS' || !!currentConv?.is_group || conversationId.includes('conv_group');
  const effectiveEventId = eventId || currentConv?.event_id;
  const event = effectiveEventId ? events.find(e => e.id === effectiveEventId) : undefined;
  const recipientUser = !isGroupChat ? users.find(u => u.id === recipientId || u.full_name === recipientName) : undefined;
  /**
   * Why this thread is read-only, if it is.
   *
   * Checked HERE and not only where a chat is opened: an existing thread can be
   * reopened straight from the Inbox, bypassing every entry-point check — which is
   * how the row-level rejection was still being hit.
   *
   * A deleted account and a closed inbox both make the composer useless, but for
   * different reasons, so they are distinguished rather than sharing one message.
   * Profiles are hard-deleted (see DataContext.removeUser), so a missing recipient
   * IS the deleted case.
   */
  const recipientMissing = !isGroupChat && !recipientUser;
  const inquiriesClosed = !isGroupChat && !!recipientUser && !canMessageUser(recipientUser, user);
  const cannotMessage = recipientMissing || inquiriesClosed;
  const blockReason = recipientMissing
    ? `${recipientName || 'This member'} is no longer on Rotaract Connect. Their account was deleted, so this conversation is read-only.`
    : inquiryBlockedMessage(recipientName);
  const confirmedParticipants = eventId ? participantsFor(eventId).filter(p => p.status === 'JOINED') : [];

  // A completed (or cancelled) event's group chat is archived: history stays fully
  // readable, but no new messages are allowed. Derived from the event's status so
  // a realtime status change flips the chat to read-only without an app restart.
  const isArchived = !!event && (event.status === 'COMPLETED' || event.status === 'CANCELLED');
  const isOrganizer = !!user && !!event && (
    user.id === event.organizer_user_id ||
    (user.role === 'CLUB_PRESIDENT' && user.club_id === event.organizing_club_id) ||
    user.role === 'APP_ADMIN' ||
    user.position === 'App Admin' ||
    user.role === 'DISTRICT_ADMIN'
  );

  const latestAnnouncement = useMemo(() => {
    if (!isGroupChat || !event) return null;
    return messages
      .slice()
      .reverse()
      .find(m => m.text?.startsWith('📢') && !m.deleted_at);
  }, [isGroupChat, event, messages]);

  const convState = conversationStateFor(conversationId, user?.id);
  const isMuted = !!convState?.muted;

  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [announcementExpanded, setAnnouncementExpanded] = useState(false);
  const [isAnnouncementMode, setIsAnnouncementMode] = useState(false);

  // Presence + typing over an ephemeral realtime channel (no DB writes).
  const me = user ? { id: user.id, name: user.full_name } : null;
  const { onlineIds, typingUsers, sendTyping } = useChatPresence(conversationId, me);

  // While this chat is on screen its incoming messages must not become notifications.
  // Handled natively rather than in the JS notification handler so it still applies
  // in the states where JS is not running (see RotaractPresentationDelegate).
  //
  // The flag is re-asserted on a heartbeat and cleared when the app backgrounds:
  // unmount cleanup alone is not enough, because force-closing the app runs no
  // cleanup at all and a stuck flag suppresses this conversation's notifications
  // entirely. Native also expires it, so the two guard each other.
  useEffect(() => {
    if (!isFocused) return;
    const assert = () => RotaractNotifications?.setActiveConversation(conversationId);
    assert();
    const heartbeat = setInterval(assert, 60_000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') assert();
      else RotaractNotifications?.setActiveConversation(null);
    });
    return () => {
      clearInterval(heartbeat);
      sub.remove();
      RotaractNotifications?.setActiveConversation(null);
    };
  }, [isFocused, conversationId]);
  const typingThrottle = useRef<number>(0);

  // Read receipts: mark the conversation read whenever it is on-screen and the
  // latest message changes. One upsert per change — never per render or on
  // background-prefetched messages.
  const lastMsgId = messages.length ? messages[messages.length - 1].id : undefined;
  useEffect(() => {
    if (isFocused && user && conversationId && lastMsgId) {
      markConversationRead(conversationId, user.id, lastMsgId);
    }
  }, [isFocused, lastMsgId, conversationId, user?.id, markConversationRead]);

  // When a new message lands: if user is at the bottom or it is their own message,
  // stay anchored at y=0; otherwise show the "New messages ↓" pill.
  useEffect(() => {
    if (!messages.length) return;
    const mine = messages[messages.length - 1]?.sender_id === user?.id;
    if (mine || atBottom.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      setShowNewMsgPill(false);
    } else {
      setShowNewMsgPill(true);
    }
  }, [lastMsgId, user?.id, messages]);

  // Members who can be @mentioned: the event's JOINED participants, minus me.
  const mentionableMembers = useMemo(() => {
    if (!isGroupChat || !eventId) return [];
    const joined = participantsFor(eventId).filter(p => p.status === 'JOINED');
    return joined
      .map(p => users.find(u => u.id === p.user_id))
      .filter((u): u is NonNullable<typeof u> => !!u && u.id !== user?.id);
  }, [isGroupChat, eventId, participantsFor, users, user?.id]);

  // Matches an in-progress "@query" at the end of the composer. Anchored to the end
  // because that is where a mention is actually being typed; matching anywhere would
  // re-open the picker while editing earlier text.
  const mentionQuery = useMemo(() => {
    if (!isGroupChat) return null;
    const m = text.match(/(?:^|\s)@([\p{L}\p{N}_.-]*)$/u);
    return m ? m[1] : null;
  }, [text, isGroupChat]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableMembers
      .filter(u => u.full_name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, mentionableMembers]);

  const insertMention = useCallback((member: { id: string; full_name: string }) => {
    setText(prev => prev.replace(/(^|\s)@([\p{L}\p{N}_.-]*)$/u, `$1@${member.full_name} `));
    setMentions(prev => (prev.some(m => m.id === member.id) ? prev : [...prev, { id: member.id, full_name: member.full_name }]));
  }, []);

  const handleTextChange = useCallback((val: string) => {
    setText(val);
    // Throttle typing:true broadcasts to at most one every 1.5s.
    const nowTs = Date.now();
    if (val.length > 0 && nowTs - typingThrottle.current > 1500) {
      typingThrottle.current = nowTs;
      sendTyping(true);
    }
    if (val.length === 0) sendTyping(false);
  }, [sendTyping]);

  const scrollToMessage = useCallback((targetId: string) => {
    const idx = reversedMessages.findIndex(m => m.id === targetId);
    if (idx !== -1) {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    } else {
      showToast({
        type: 'info',
        title: 'Message Not Found',
        message: 'The quoted message is not currently loaded in the chat history.',
      });
    }
  }, [reversedMessages, showToast]);

  const handleSend = () => {
    if (!text.trim() || !user || cannotMessage || isArchived) return;
    const finalMentions = mentions.filter(m => text.includes(`@${m.full_name}`));
    const finalText = isAnnouncementMode ? `📢 [ANNOUNCEMENT]\n${text.trim()}` : text.trim();
    const replyMeta = replyingTo ? {
      id: replyingTo.id,
      senderName: replyingTo.sender_name,
      text: replyingTo.text ? replyingTo.text.replace(/^📢\s*(\[ANNOUNCEMENT\])?\s*/i, '') : (replyingTo.attachment_path ? '📷 Photo' : ''),
    } : undefined;

    sendDirectMessage(
      conversationId,
      eventId,
      user,
      isGroupChat ? undefined : recipientId,
      recipientName,
      finalText,
      eventTitle || event?.title,
      undefined,
      finalMentions.length ? finalMentions.map(m => m.id) : undefined,
      undefined,
      undefined,
      replyMeta,
    );
    setText('');
    setMentions([]);
    setReplyingTo(null);
    setIsAnnouncementMode(false);
    sendTyping(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleAttachPhoto = async () => {
    if (!user || isArchived || cannotMessage) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Photo access is required to send a photo.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setUploading(true);
      try {
        // Private bucket, path scoped to the conversation + sender (see 0007 RLS).
        const path = await uploadImageAsset('chat-media', `${conversationId}/${user.id}`, {
          uri: a.uri, base64: a.base64, mimeType: a.mimeType, fileName: a.fileName,
        });
        const replyMeta = replyingTo ? {
          id: replyingTo.id,
          senderName: replyingTo.sender_name,
          text: replyingTo.text ? replyingTo.text.replace(/^📢\s*(\[ANNOUNCEMENT\])?\s*/i, '') : (replyingTo.attachment_path ? '📷 Photo' : ''),
        } : undefined;

        sendDirectMessage(
          conversationId, eventId, user, isGroupChat ? undefined : recipientId, recipientName,
          '', eventTitle || event?.title, path, undefined, a.width, a.height, replyMeta,
        );
        setReplyingTo(null);
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } catch (err: any) {
        Alert.alert('Upload Failed', err?.message || 'Could not send the photo. Please try again.');
      } finally {
        setUploading(false);
      }
    } catch {
      Alert.alert('Error', 'Unable to open the photo library.');
    }
  };

  // Read-receipt status for one of MY messages.
  //
  // Compared by message ORDER, not wall-clock time: each reader's cursor records
  // the last message id they read, and every device shares the same ordered list,
  // so "their last-read message is at or after mine" is independent of device
  // clock skew (comparing created_at vs last_read_at across two phones made "Seen"
  // show only on whichever device had the faster clock). A timestamp check is kept
  // as a fallback for legacy cursors that predate last_read_message_id.
  const cursors = readCursorsFor(conversationId);
  const messageIndex = useMemo(() => {
    const m = new Map<string, number>();
    messages.forEach((msg, i) => m.set(msg.id, i));
    return m;
  }, [messages]);

  // How many participants (other than the author and current viewer) have read a given message.
  const readCountFor = useCallback((msg: DirectMessage): number => {
    const myPos = messageIndex.get(msg.id);
    const msgTime = new Date(msg.created_at).getTime();
    return cursors.filter(c => {
      if (c.user_id === msg.sender_id || c.user_id === user?.id) return false;
      // Primary: matched by message order
      if (c.last_read_message_id) {
        const readerPos = messageIndex.get(c.last_read_message_id);
        if (readerPos !== undefined) return readerPos >= (myPos ?? 0);
      }
      // Fallback: timestamp check (must be at least 1s after the message creation to prevent local skew)
      if (c.last_read_at) {
        const readTime = new Date(c.last_read_at).getTime();
        return readTime > msgTime + 1000;
      }
      return false;
    }).length;
  }, [cursors, messageIndex, user?.id]);

  // The other participants who have read a given message.
  const readersFor = useCallback((msg: DirectMessage) => {
    const myPos = messageIndex.get(msg.id);
    const msgTime = new Date(msg.created_at).getTime();
    return cursors
      .filter(c => c.user_id !== msg.sender_id && c.user_id !== user?.id)
      .filter(c => {
        if (c.last_read_message_id) {
          const rp = messageIndex.get(c.last_read_message_id);
          if (rp !== undefined) return rp >= (myPos ?? 0);
        }
        if (c.last_read_at) {
          const readTime = new Date(c.last_read_at).getTime();
          return readTime > msgTime + 1000;
        }
        return false;
      })
      .map(c => users.find(u => u.id === c.user_id))
      .filter((u): u is NonNullable<typeof u> => !!u);
  }, [cursors, messageIndex, users, user?.id]);

  if (!user) return null;

  const displayName = isGroupChat ? `${eventTitle || event?.title || 'Event'} Group Chat` : recipientUser?.full_name || recipientName;
  const recipientOnline = !isGroupChat && !!recipientUser && onlineIds.has(recipientUser.id);
  const onlineGroupCount = isGroupChat ? Array.from(onlineIds).filter(id => id !== user.id).length : 0;
  const displayClub = isGroupChat
    ? `${confirmedParticipants.length} confirmed • ${onlineGroupCount} online`
    : (recipientOnline ? 'Active now' : recipientUser?.club_name || 'Rotaract Club');
  const displayPosition = isGroupChat ? 'Official Event Chat' : recipientUser?.position || 'Rotaractor';

  // "John is typing…" / "John and Maria are typing…" / "3 people are typing…"
  const typingLabel = typingUsers.length === 0 ? null
    : typingUsers.length === 1 ? `${typingUsers[0]?.name?.split(' ')?.[0] || 'Someone'} is typing…`
    : typingUsers.length === 2 ? `${typingUsers[0]?.name?.split(' ')?.[0] || 'Someone'} and ${typingUsers[1]?.name?.split(' ')?.[0] || 'Someone'} are typing…`
    : `${typingUsers.length} people are typing…`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      {/* Header Card */}
      <View style={[styles.userHeaderCard, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border }]}>
        {isGroupChat ? (
          <TouchableOpacity
            style={[styles.avatarCircle, { backgroundColor: themeColors.primary }]}
            onPress={() => { if (eventId) navigation.navigate('Participants', { eventId }); }}
          >
            <Ionicons name="chatbubbles" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => recipientUser && setSelectedUserModal(recipientUser)}>
            <View>
              <UserAvatar user={recipientUser ?? { full_name: displayName }} size={44} />
              {recipientOnline && <View style={[styles.onlineDot, { borderColor: themeColors.cardBg }]} />}
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.7}
          onPress={() => {
            if (!isGroupChat && recipientUser) setSelectedUserModal(recipientUser);
            else if (eventId) navigation.navigate('Participants', { eventId });
          }}
        >
          <View style={styles.nameRow}>
            <Text style={[styles.userName, { color: themeColors.text }]} numberOfLines={1}>{displayName}</Text>
            {!isGroupChat && <VerifiedCheck user={recipientUser} size={15} />}
          </View>
          <Text style={[styles.userSub, { color: recipientOnline ? themeColors.success : themeColors.textMuted }]} numberOfLines={1}>
            {displayPosition} • {displayClub}
          </Text>
        </TouchableOpacity>

        {/* Mute / Unmute bell toggle button */}
        <TouchableOpacity
          style={[styles.headerMuteBtn, { backgroundColor: isMuted ? 'rgba(239, 68, 68, 0.12)' : themeColors.surface }]}
          onPress={() => {
            if (user && conversationId) {
              const nextMuted = !isMuted;
              setConversationMuted(conversationId, user.id, nextMuted);
              showToast({ title: nextMuted ? 'Conversation muted' : 'Conversation unmuted', type: 'info' });
            }
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isMuted ? 'notifications-off' : 'notifications-outline'}
            size={18}
            color={isMuted ? '#EF4444' : themeColors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {isArchived && (
        <View style={[styles.archivedBanner, { backgroundColor: themeColors.textMuted + '1A', borderColor: themeColors.border }]}>
          <Ionicons name="archive-outline" size={14} color={themeColors.textMuted} />
          <Text style={[styles.archivedText, { color: themeColors.textMuted }]}>
            This conversation is archived ({event?.status === 'CANCELLED' ? 'event cancelled' : 'event completed'}). You can read past messages but can't send new ones.
          </Text>
        </View>
      )}

      {/* Group chats keep a persistent "view event details" header. 1-on-1 event
          chats show the event link inside the thread instead (see ListHeaderComponent). */}
      {isGroupChat && eventId && (eventTitle || event) ? (
        <TouchableOpacity
          style={[styles.eventBanner, { backgroundColor: themeColors.primary + '1A', borderColor: themeColors.primary + '3D' }]}
          onPress={() => navigation.navigate('EventDetail', { eventId })}
        >
          <Ionicons name="calendar" size={14} color={themeColors.primary} />
          <Text style={[styles.eventBannerText, { color: themeColors.primary }]}>
            View event details: {eventTitle || event?.title}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={themeColors.primary} />
        </TouchableOpacity>
      ) : null}

      {/* 📢 Pinned Organizer Announcement Banner */}
      {isGroupChat && latestAnnouncement && !announcementDismissed && (
        <View style={[styles.announcementBanner, { backgroundColor: isNightMode ? themeColors.cardBg : '#FFFBEB', borderColor: '#F59E0B' }]}>
          <View style={styles.announcementTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="megaphone" size={14} color="#D97706" />
              <Text style={[styles.announcementTag, { color: '#D97706' }]}>OFFICER ANNOUNCEMENT</Text>
            </View>
            <TouchableOpacity onPress={() => setAnnouncementDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setAnnouncementExpanded(prev => !prev)} activeOpacity={0.8}>
            <Text
              style={[styles.announcementText, { color: themeColors.text }]}
              numberOfLines={announcementExpanded ? undefined : 2}
            >
              {latestAnnouncement.text.replace(/^📢\s*(\[ANNOUNCEMENT\])?\s*/i, '')}
            </Text>
            <View style={styles.announcementMetaRow}>
              <Text style={[styles.announcementAuthor, { color: themeColors.textMuted }]}>
                Pinned by {latestAnnouncement.sender_name} • {formatTime(latestAnnouncement.created_at)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {(() => {
                  const readers = readersFor(latestAnnouncement);
                  const pCount = readers.length;
                  return (
                    <TouchableOpacity
                      onPress={() => setExpandedSeenId(prev => (prev === latestAnnouncement.id ? null : latestAnnouncement.id))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Ionicons name="checkmark-done" size={13} color={pCount > 0 ? READ_TICK_COLOR : themeColors.textMuted} />
                      {pCount > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 2 }}>
                          {readers.slice(0, 4).map((r, i) => (
                            <View key={r.id} style={{ marginLeft: i > 0 ? -6 : 0, borderRadius: 9, borderWidth: 1.5, borderColor: themeColors.cardBg }}>
                              <UserAvatar user={r} size={16} showBadge={false} />
                            </View>
                          ))}
                          {pCount > 4 && (
                            <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.textMuted, marginLeft: 4 }}>
                              +{pCount - 4}
                            </Text>
                          )}
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, fontWeight: '600', color: themeColors.textMuted }}>
                          Not seen yet
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })()}
                <Text style={[styles.announcementToggleText, { color: themeColors.primary }]}>
                  {announcementExpanded ? 'Show less' : 'Read full'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight + 10 : headerHeight}
      >
        {reversedMessages.length === 0 ? (
          <View style={[styles.emptyChatWrap, { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.primary + '18' }]}>
              <Ionicons name="chatbubbles-outline" size={36} color={themeColors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
              {isGroupChat ? 'Event Group Chat' : displayName}
            </Text>
            <Text style={[styles.emptySub, { color: themeColors.textMuted }]}>
              {isGroupChat ? 'Welcome! Send a message to start communicating with everyone.' : `No messages yet. Say hi to ${displayName}!`}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={reversedMessages}
            inverted
            keyExtractor={m => m.id}
            style={{ flex: 1 }}
            contentContainerStyle={styles.messageList}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({ offset: info.highestMeasuredFrameIndex * 50, animated: true });
            }}
            renderItem={({ item, index }) => {
            const isMe = item.sender_id === user.id;
            const isAnnouncement = !!item.is_broadcast || !!item.text?.startsWith('📢');
            const senderUser = users.find(u => u.id === item.sender_id);
            const readCount = readCountFor(item);
            const isRead = readCount > 0;
            // Inverted list: chronological run starts when the older message (index + 1) has a different event_id
            const msgEvent = !isGroupChat && item.event_id ? events.find(e => e.id === item.event_id) : undefined;
            const showEventChip = !!msgEvent && (index === reversedMessages.length - 1 || reversedMessages[index + 1]?.event_id !== item.event_id);

            const msgReactions = reactionsFor(item.id);
            const reactionMap = new Map<string, { count: number; userReacted: boolean }>();
            for (const r of msgReactions) {
              const cur = reactionMap.get(r.emoji) || { count: 0, userReacted: false };
              cur.count += 1;
              if (r.user_id === user.id) cur.userReacted = true;
              reactionMap.set(r.emoji, cur);
            }
            const groupedReactions = Array.from(reactionMap.entries()).map(([emoji, data]) => ({ emoji, ...data }));

            return (
              <SwipeableRow
                onReply={() => !item.deleted_at && setReplyingTo(item)}
              >
              <View>
                <View style={[styles.messageWrapper, isMe ? styles.myWrapper : styles.theirWrapper]}>
                  {!isMe && (
                    <TouchableOpacity onPress={() => senderUser && setSelectedUserModal(senderUser)}>
                      <UserAvatar user={senderUser ?? { full_name: item.sender_name }} size={28} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    activeOpacity={isGroupChat ? 0.85 : 1}
                    // Tap (group) reveals who's seen it; long-press opens the delete menu.
                    onPress={isGroupChat ? () => setExpandedSeenId(prev => (prev === item.id ? null : item.id)) : undefined}
                    onLongPress={() => setActionMsg(item)}
                    delayLongPress={300}
                    style={[
                      styles.bubble,
                      isAnnouncement
                        ? [styles.announcementBubble, { backgroundColor: isNightMode ? '#2B1E05' : '#FFFBEB', borderColor: '#F59E0B' }]
                        : isMe
                        ? [styles.myBubble, { backgroundColor: themeColors.primary }]
                        : [styles.theirBubble, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }],
                      item.deleted_at && styles.deletedBubble,
                    ]}
                  >
                    {isAnnouncement && !item.deleted_at && (
                      <View style={styles.announcementBubbleHeader}>
                        <Ionicons name="megaphone" size={12} color="#D97706" />
                        <Text style={styles.announcementBubbleHeaderText}>OFFICER ANNOUNCEMENT</Text>
                      </View>
                    )}
                    {showEventChip && msgEvent && (
                      <TouchableOpacity
                        style={[styles.msgEventChip, { backgroundColor: isMe ? 'rgba(255,255,255,0.18)' : themeColors.primary + '18', borderColor: isMe ? 'rgba(255,255,255,0.35)' : themeColors.primary + '40' }]}
                        onPress={() => item.event_id && navigation.navigate('EventDetail', { eventId: item.event_id })}
                      >
                        <Ionicons name="pricetag" size={11} color={isMe ? '#fff' : themeColors.primary} />
                        <Text numberOfLines={1} style={[styles.msgEventChipText, { color: isMe ? '#fff' : themeColors.primary }]}>{msgEvent.title}</Text>
                        <Ionicons name="chevron-forward" size={11} color={isMe ? 'rgba(255,255,255,0.85)' : themeColors.primary} />
                      </TouchableOpacity>
                    )}
                    {!isMe && isGroupChat && (
                      <TouchableOpacity onPress={() => senderUser && setSelectedUserModal(senderUser)}>
                        <View style={styles.senderNameRow}>
                          <Text style={[styles.senderName, { color: isAnnouncement ? '#D97706' : themeColors.primary }]}>
                            {item.sender_name} {senderUser ? `(${senderUser.position})` : ''}
                          </Text>
                          <VerifiedCheck user={senderUser} size={12} />
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Quoted / Replied-to message snippet inside the bubble */}
                    {!!item.reply_to_message_id && !item.deleted_at && (
                      <TouchableOpacity
                        style={[
                          styles.quotedSnippet,
                          {
                            borderLeftColor: isMe ? 'rgba(255,255,255,0.9)' : themeColors.primary,
                            backgroundColor: isMe ? 'rgba(0,0,0,0.14)' : (isNightMode ? '#1F2937' : '#F3F4F6'),
                          },
                        ]}
                        onPress={() => item.reply_to_message_id && scrollToMessage(item.reply_to_message_id)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.quotedSnippetHeader}>
                          <Ionicons name="arrow-undo" size={11} color={isMe ? 'rgba(255,255,255,0.95)' : themeColors.primary} />
                          <Text style={[styles.quotedSnippetAuthor, { color: isMe ? '#fff' : themeColors.primary }]} numberOfLines={1}>
                            {item.reply_to_sender_name || 'Replied Message'}
                          </Text>
                        </View>
                        <Text style={[styles.quotedSnippetText, { color: isMe ? 'rgba(255,255,255,0.85)' : themeColors.textMuted }]} numberOfLines={2}>
                          {item.reply_to_text || 'Original message'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {item.deleted_at ? (
                      <View style={styles.tombstoneRow}>
                        <Ionicons name="ban-outline" size={13} color={isMe ? 'rgba(255,255,255,0.85)' : themeColors.textMuted} />
                        <Text style={[styles.tombstoneText, { color: isMe ? 'rgba(255,255,255,0.85)' : themeColors.textMuted }]}>
                          This message was deleted
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onLongPress={() => setActionMsg(item)}
                        delayLongPress={250}
                      >
                        {item.attachment_path && item.attachment_type === 'image' && (
                          <ChatImage
                            path={item.attachment_path}
                            width={item.attachment_width}
                            height={item.attachment_height}
                            onPress={setFullImageUri}
                            onLongPress={() => setActionMsg(item)}
                          />
                        )}
                        {!!item.text && (
                          <Text style={[
                            styles.messageText,
                            { color: isAnnouncement ? (isNightMode ? '#FDE68A' : '#78350F') : (isMe ? '#fff' : themeColors.text) }
                          ]}>
                            {isAnnouncement ? item.text.replace(/^📢\s*(\[ANNOUNCEMENT\])?\s*/i, '') : item.text}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {/* The meta row (time + ticks) is also a toggle target for the
                        "Seen by …" detail — this is the tap that works on photo
                        messages, where tapping the image opens it fullscreen. */}
                    <TouchableOpacity
                      style={styles.metaRow}
                      activeOpacity={isGroupChat ? 0.6 : 1}
                      onPress={isGroupChat ? () => setExpandedSeenId(prev => (prev === item.id ? null : item.id)) : undefined}
                    >
                      <Text style={[
                        styles.messageTime,
                        { color: isAnnouncement ? (isNightMode ? '#FDE68A99' : '#B45309') : (isMe ? 'rgba(255,255,255,0.7)' : themeColors.textMuted) }
                      ]}>
                        {formatTime(item.created_at)}
                      </Text>
                      {isMe && !item.deleted_at && item.send_status === 'sending' && <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.7)" />}
                      {isMe && !item.deleted_at && item.send_status === 'failed' && (
                        <TouchableOpacity onPress={() => retryMessage(item.id)} style={styles.retryBtn}>
                          <Ionicons name="alert-circle" size={13} color="#FFD7D7" />
                          <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                      )}
                      {/* Delivery/read ticks: ✓ = sent, ✓✓ (colored) = read. */}
                      {isMe && !item.deleted_at && item.send_status !== 'sending' && item.send_status !== 'failed' && (
                        <View style={styles.receiptRow}>
                          <Ionicons
                            name={isRead ? 'checkmark-done' : 'checkmark'}
                            size={15}
                            color={isRead ? (isAnnouncement ? '#D97706' : READ_TICK_COLOR) : 'rgba(255,255,255,0.7)'}
                          />
                        </View>
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
                {/* Docked reaction chips */}
                {groupedReactions.length > 0 && !item.deleted_at && (
                  <View style={[styles.reactionChipsRow, isMe ? styles.reactionChipsRowMe : styles.reactionChipsRowThem]}>
                    {groupedReactions.map(({ emoji, count, userReacted }) => (
                      <TouchableOpacity
                        key={emoji}
                        style={[
                          styles.reactionChip,
                          {
                            backgroundColor: userReacted ? (isMe ? themeColors.primary + '25' : themeColors.primary + '18') : (isNightMode ? '#1E293B' : '#FFFFFF'),
                            borderColor: userReacted ? themeColors.primary : (isNightMode ? '#334155' : '#E2E8F0'),
                          },
                        ]}
                        onPress={() => user && toggleMessageReaction(item.id, user.id, emoji)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.reactionChipEmoji}>{emoji}</Text>
                        {count > 1 && (
                          <Text style={[styles.reactionChipCount, { color: userReacted ? themeColors.primary : themeColors.textMuted }]}>
                            {count}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {isGroupChat && !item.deleted_at && (
                  expandedSeenId === item.id ? (() => {
                    const readers = readersFor(item);
                    return (
                      <TouchableOpacity
                        style={[styles.seenByRow, isMe ? styles.myWrapper : styles.seenByTheir]}
                        onPress={() => setExpandedSeenId(null)}
                      >
                        {readers.length === 0 ? (
                          <Text style={[styles.seenByText, { color: themeColors.textMuted }]}>Not seen yet</Text>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <View style={styles.compactSeenStack}>
                              {readers.slice(0, 8).map((r, i) => (
                                <View key={r.id} style={[styles.compactSeenAvatar, { marginLeft: i > 0 ? -6 : 0, borderColor: themeColors.bg }]}>
                                  <UserAvatar user={r} size={18} showBadge={false} />
                                </View>
                              ))}
                            </View>
                            <Text style={[styles.seenByText, { color: themeColors.textMuted }]}>
                              Seen by {readers.map(r => r.full_name?.split(' ')?.[0] || 'Member').join(', ')}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })() : (
                    // Compact avatar-only summary under YOUR OWN group messages or ANNOUNCEMENTS
                    (isMe || isAnnouncement) && readCount > 0 ? (() => {
                      const readers = readersFor(item);
                      return (
                        <TouchableOpacity
                          style={[styles.seenByRow, isMe ? styles.myWrapper : styles.seenByTheir]}
                          onPress={() => setExpandedSeenId(item.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="checkmark-done" size={12} color={isAnnouncement ? '#D97706' : READ_TICK_COLOR} />
                          <View style={styles.compactSeenStack}>
                            {readers.slice(0, 5).map((r, i) => (
                              <View key={r.id} style={[styles.compactSeenAvatar, { marginLeft: i > 0 ? -6 : 0, borderColor: themeColors.bg }]}>
                                <UserAvatar user={r} size={16} showBadge={false} />
                              </View>
                            ))}
                            {readers.length > 5 && (
                              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.textMuted, marginLeft: 4 }}>
                                +{readers.length - 5}
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })() : null
                  )
                )}
              </View>
              </SwipeableRow>
            );
          }}
        />
        )}

        {typingLabel ? (
          <Text style={[styles.typingLabel, { color: themeColors.textMuted }]}>{typingLabel}</Text>
        ) : null}

        {isArchived ? (
          <View style={[styles.archivedComposer, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
            <Ionicons name="lock-closed" size={14} color={themeColors.textMuted} />
            <Text style={[styles.archivedComposerText, { color: themeColors.textMuted }]}>Messaging is closed for this archived conversation</Text>
          </View>
        ) : cannotMessage ? (
          <TouchableOpacity
            style={[styles.archivedComposer, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}
            onPress={() => setReasonVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="lock-closed" size={14} color={themeColors.textMuted} />
            <Text style={[styles.archivedComposerText, { color: themeColors.textMuted }]}>
              You can't message this account
            </Text>
            <Ionicons name="information-circle-outline" size={15} color={themeColors.textMuted} />
          </TouchableOpacity>
        ) : (
          <>
            {/* Member picker, shown while an "@query" is being typed. A plain mapped
                list rather than a FlatList: it is capped at six rows, and nesting a
                VirtualizedList inside the message list warns at runtime. */}
            {mentionMatches.length > 0 && (
              <View style={[styles.mentionBar, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
                {mentionMatches.map(member => (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.mentionRow}
                    onPress={() => insertMention(member)}
                    activeOpacity={0.7}
                  >
                    <UserAvatar user={member} size={28} showBadge={false} />
                    <Text style={[styles.mentionName, { color: themeColors.text }]} numberOfLines={1}>
                      {member.full_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Confirmed mentions, so the user can see who the message will notify. */}
            {mentions.length > 0 && (
              <View style={[styles.mentionChipRow, { backgroundColor: themeColors.cardBg }]}>
                {mentions.map(m => (
                  <View key={m.id} style={[styles.mentionChip, { backgroundColor: themeColors.primary + '1A' }]}>
                    <Text style={[styles.mentionChipText, { color: themeColors.primary }]}>@{m.full_name}</Text>
                  </View>
                ))}
              </View>
            )}

            {showNewMsgPill && (
              <View style={styles.newMsgPillWrap} pointerEvents="box-none">
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.newMsgPill, { backgroundColor: themeColors.primary }]}
                  onPress={() => {
                    listRef.current?.scrollToOffset({ offset: 0, animated: true });
                    setShowNewMsgPill(false);
                  }}
                >
                  <Ionicons name="arrow-down" size={13} color="#fff" />
                  <Text style={styles.newMsgPillText}>New messages</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Quote Preview Bar above composer */}
            {replyingTo && (
              <View style={[styles.replyPreviewBar, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
                <View style={[styles.replyPreviewAccent, { backgroundColor: themeColors.primary }]} />
                <View style={styles.replyPreviewContent}>
                  <View style={styles.replyPreviewHeader}>
                    <Ionicons name="arrow-undo" size={12} color={themeColors.primary} />
                    <Text style={[styles.replyPreviewTitle, { color: themeColors.primary }]}>
                      Replying to {replyingTo.sender_name}
                    </Text>
                  </View>
                  <Text style={[styles.replyPreviewSnippet, { color: themeColors.textMuted }]} numberOfLines={1}>
                    {replyingTo.text ? replyingTo.text.replace(/^📢\s*(\[ANNOUNCEMENT\])?\s*/i, '') : (replyingTo.attachment_path ? '📷 Photo' : 'Original message')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.replyPreviewClose}
                  onPress={() => setReplyingTo(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={20} color={themeColors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.inputBar, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
            <TouchableOpacity style={styles.attachBtn} onPress={handleAttachPhoto} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color={themeColors.primary} /> : <Ionicons name="image" size={22} color={themeColors.primary} />}
            </TouchableOpacity>
            {isOrganizer && isGroupChat && (
              <TouchableOpacity
                style={[
                  styles.announcementToggleBtn,
                  isAnnouncementMode && { backgroundColor: '#F59E0B' + '22', borderColor: '#F59E0B' },
                ]}
                onPress={() => setIsAnnouncementMode(prev => !prev)}
              >
                <Ionicons name="megaphone" size={18} color={isAnnouncementMode ? '#D97706' : themeColors.textMuted} />
              </TouchableOpacity>
            )}
            <TextInput
              style={[
                styles.textInput,
                { backgroundColor: themeColors.surface, borderColor: isAnnouncementMode ? '#F59E0B' : themeColors.border, color: themeColors.text },
              ]}
              placeholder={isAnnouncementMode ? 'Broadcast pinned announcement...' : isGroupChat ? 'Message group chat...' : 'Type a message...'}
              placeholderTextColor={themeColors.textMuted}
              value={text}
              onChangeText={handleTextChange}
              onBlur={() => sendTyping(false)}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: isAnnouncementMode ? '#D97706' : themeColors.primary }, !text.trim() && styles.sendBtnDisabled]}
              disabled={!text.trim()}
              onPress={handleSend}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* Long-press message menu: Quick reactions, reply, copy, and delete choices. */}
      <BottomSheet
        visible={!!actionMsg}
        onClose={() => setActionMsg(null)}
        cardStyle={[styles.menuCard, { backgroundColor: themeColors.cardBg }]}
      >
        {/* Floating Quick Reaction Bar */}
        {actionMsg && !actionMsg.deleted_at && (
          <View style={[styles.quickReactionContainer, { backgroundColor: isNightMode ? '#1E293B' : '#F1F5F9' }]}>
            {['👍', '❤️', '😂', '😮', '😢', '👏'].map(emoji => {
              const activeReaction = reactionsFor(actionMsg.id).find(r => r.user_id === user?.id && r.emoji === emoji);
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.quickReactionBtn,
                    activeReaction && { backgroundColor: themeColors.primary + '28', borderColor: themeColors.primary, borderWidth: 1 }
                  ]}
                  onPress={() => {
                    if (user) {
                      toggleMessageReaction(actionMsg.id, user.id, emoji);
                    }
                    setActionMsg(null);
                  }}
                  activeOpacity={0.65}
                >
                  <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={[styles.menuTitle, { color: themeColors.textMuted }]}>Message Options</Text>
        
        {actionMsg && !actionMsg.deleted_at && (
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => {
              setReplyingTo(actionMsg);
              setActionMsg(null);
            }}
          >
            <Ionicons name="arrow-undo-outline" size={20} color={themeColors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: themeColors.text }]}>Reply</Text>
              <Text style={[styles.menuSub, { color: themeColors.textMuted }]}>Quote this message in your reply</Text>
            </View>
          </TouchableOpacity>
        )}

        {actionMsg && !!actionMsg.text && !actionMsg.deleted_at && (
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => {
              if (actionMsg?.text) {
                Clipboard.setString(actionMsg.text);
                setActionMsg(null);
                showToast({
                  type: 'success',
                  title: 'Copied',
                  message: 'Message copied to clipboard',
                });
              }
            }}
          >
            <Ionicons name="copy-outline" size={20} color={themeColors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: themeColors.text }]}>Copy Text</Text>
              <Text style={[styles.menuSub, { color: themeColors.textMuted }]}>Copy message content to clipboard</Text>
            </View>
          </TouchableOpacity>
        )}

        {actionMsg && actionMsg.sender_id === user.id && !actionMsg.deleted_at && (
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => { const id = actionMsg.id; setActionMsg(null); unsendMessage(id); }}
          >
            <Ionicons name="trash" size={20} color={themeColors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: themeColors.danger }]}>Unsend for everyone</Text>
              <Text style={[styles.menuSub, { color: themeColors.textMuted }]}>Removes it for all participants, leaving "This message was deleted"</Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.menuRow}
          onPress={() => { if (actionMsg) deleteMessageForMe(actionMsg.id, user.id); setActionMsg(null); }}
        >
          <Ionicons name="eye-off-outline" size={20} color={themeColors.text} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuLabel, { color: themeColors.text }]}>Delete for me</Text>
            <Text style={[styles.menuSub, { color: themeColors.textMuted }]}>Hides it from your view only</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuRow, styles.menuCancel]} onPress={() => setActionMsg(null)}>
          <Text style={[styles.menuLabel, { color: themeColors.textMuted, textAlign: 'center', flex: 1 }]}>Cancel</Text>
        </TouchableOpacity>
      </BottomSheet>

      <FullImageModal
        visible={!!fullImageUri}
        imageUri={fullImageUri}
        title="Photo"
        onClose={() => setFullImageUri(null)}
      />

      <UserProfileModal
        visible={!!selectedUserModal}
        targetUser={selectedUserModal}
        onClose={() => setSelectedUserModal(null)}
        eventContext={eventId && (eventTitle || event?.title) ? { eventId, eventTitle: eventTitle || event!.title } : undefined}
        onStartChat={(targetUser, aboutEvent) => {
          setSelectedUserModal(null);
          if (targetUser.id !== recipientId) {
            if (!canMessageUser(users.find(u => u.id === targetUser.id), user)) {
              setBlockedName(targetUser.full_name);
              return;
            }
            const ctxEventId = aboutEvent ? eventId : undefined;
            const conv = getOrCreateConversation(ctxEventId, user, targetUser.id, targetUser.full_name);
            navigation.push('Chat', {
              conversationId: conv.id,
              eventId: ctxEventId,
              recipientId: targetUser.id,
              recipientName: targetUser.full_name,
              eventTitle: aboutEvent ? (eventTitle || event?.title) : undefined,
            });
          }
        }}
      />
          <ConfirmDialog
        visible={reasonVisible}
        title={recipientMissing ? 'Account deleted' : 'Messaging unavailable'}
        message={blockReason}
        onClose={() => setReasonVisible(false)}
        confirmLabel="OK"
      />

      <ConfirmDialog
        visible={!!blockedName}
        title="Messaging unavailable"
        message={blockedName ? inquiryBlockedMessage(blockedName) : undefined}
        onClose={() => setBlockedName(null)}
        confirmLabel="OK"
      />
</SafeAreaView>
  );
}

/** Renders a chat photo, resolving a signed URL with pre-reserved aspect ratio to eliminate layout shifts. */
function ChatImage({
  path,
  width,
  height,
  onPress,
  onLongPress,
}: {
  path: string;
  width?: number;
  height?: number;
  onPress: (uri: string) => void;
  onLongPress?: () => void;
}) {
  const uri = useSignedUrl('chat-media', path);
  const { colors } = useTheme();

  const MAX_WIDTH = 220;
  const MAX_HEIGHT = 280;
  const aspectRatio = width && height && width > 0 && height > 0 ? width / height : 4 / 3;
  let displayWidth = MAX_WIDTH;
  let displayHeight = displayWidth / aspectRatio;
  if (displayHeight > MAX_HEIGHT) {
    displayHeight = MAX_HEIGHT;
    displayWidth = displayHeight * aspectRatio;
  }

  const imageStyle = {
    width: displayWidth,
    height: displayHeight,
    borderRadius: 12,
    marginBottom: 4,
  };

  if (!uri) {
    return (
      <View style={[imageStyle, styles.chatImageLoading, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(uri)} onLongPress={onLongPress} delayLongPress={300}>
      <Image source={{ uri }} style={imageStyle} resizeMode="cover" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  mentionBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  mentionName: { fontSize: 14, fontWeight: '600', flex: 1 },
  mentionChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 6 },
  mentionChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  mentionChipText: { fontSize: 12, fontWeight: '700' },
  userHeaderCard: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 15, fontWeight: '700' },
  userSub: { fontSize: 12, marginTop: 1 },
  archivedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  archivedText: { flex: 1, fontSize: 11, fontWeight: '600' },
  eventBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  eventBannerText: { flex: 1, fontSize: 12, fontWeight: '700' },
  msgEventChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  msgEventChipText: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  messageList: { padding: 16, paddingBottom: 24, gap: 12 },
  messageWrapper: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  myWrapper: { justifyContent: 'flex-end' },
  theirWrapper: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', padding: 12, borderRadius: 16 },
  myBubble: { borderBottomRightRadius: 4 },
  theirBubble: { borderBottomLeftRadius: 4, borderWidth: 1 },
  deletedBubble: { opacity: 0.85 },
  tombstoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tombstoneText: { fontSize: 13, fontStyle: 'italic' },
  senderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  senderName: { fontSize: 11, fontWeight: '700' },
  messageText: { fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 4 },
  messageTime: { fontSize: 10 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  retryText: { fontSize: 10, color: '#FFD7D7', fontWeight: '700' },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  receiptCount: { fontSize: 10, fontWeight: '800' },
  seenByRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, marginHorizontal: 4, flexWrap: 'wrap' },
  seenByTheir: { justifyContent: 'flex-start', paddingLeft: 36 },
  seenByText: { fontSize: 11, fontStyle: 'italic' },
  seenByAvatars: { flexDirection: 'row', gap: 2 },
  seenByAvatar: { borderRadius: 8, overflow: 'hidden' },
  chatImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  chatImageLoading: { alignItems: 'center', justifyContent: 'center' },
  typingLabel: { fontSize: 12, fontStyle: 'italic', paddingHorizontal: 20, paddingBottom: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  attachBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  textInput: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 100, fontSize: 15 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  archivedComposer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1 },
  archivedComposerText: { fontSize: 12, fontWeight: '600' },
  emptyChatWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },
  empty: { textAlign: 'center', marginTop: 40 },
  menuCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 4 },
  menuTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 8 },
  menuLabel: { fontSize: 15, fontWeight: '700' },
  menuSub: { fontSize: 12, marginTop: 1 },
  menuCancel: { justifyContent: 'center', marginTop: 4 },
  newMsgPillWrap: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    zIndex: 10,
  },
  newMsgPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  newMsgPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  announcementBanner: { padding: 12, borderBottomWidth: 1, borderWidth: 1, marginHorizontal: 12, marginTop: 6, borderRadius: 12 },
  announcementTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  announcementTag: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  announcementText: { fontSize: 13, lineHeight: 18 },
  announcementMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  announcementAuthor: { fontSize: 10 },
  announcementToggleText: { fontSize: 11, fontWeight: '700' },
  announcementToggleBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  headerMuteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  announcementBubble: {
    borderWidth: 1.5,
    borderRadius: 16,
  },
  announcementBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F59E0B66',
  },
  announcementBubbleHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  compactSeenStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactSeenAvatar: {
    borderRadius: 10,
    borderWidth: 1.5,
  },
  quotedSnippet: {
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 6,
  },
  quotedSnippetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  quotedSnippetAuthor: {
    fontSize: 11,
    fontWeight: '700',
  },
  quotedSnippetText: {
    fontSize: 12,
    lineHeight: 16,
  },
  reactionChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
    marginHorizontal: 4,
  },
  reactionChipsRowMe: {
    justifyContent: 'flex-end',
  },
  reactionChipsRowThem: {
    justifyContent: 'flex-start',
    paddingLeft: 36,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
    elevation: 1,
  },
  reactionChipEmoji: {
    fontSize: 13,
  },
  reactionChipCount: {
    fontSize: 11,
    fontWeight: '800',
  },
  quickReactionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 24,
    marginBottom: 8,
  },
  quickReactionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickReactionEmoji: {
    fontSize: 24,
  },
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  replyPreviewAccent: {
    width: 3,
    height: '100%',
    borderRadius: 2,
    marginRight: 10,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  replyPreviewTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  replyPreviewSnippet: {
    fontSize: 12,
    marginTop: 1,
  },
  replyPreviewClose: {
    padding: 4,
    marginLeft: 8,
  },
});
