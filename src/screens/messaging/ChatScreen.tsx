import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Platform, Image, Alert, ActivityIndicator, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
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
    getOrCreateConversation, markConversationRead, readCursorsFor,
  } = useData();
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const listRef = useRef<FlatList>(null);
  // Track the keyboard height ourselves instead of relying on KeyboardAvoidingView:
  // this app is edge-to-edge on Android, where windowSoftInputMode=adjustResize
  // does not resize the window, so KAV either overshot (gap) or did nothing
  // (keyboard covered the composer). Padding by the measured keyboard height
  // (minus the bottom safe-area inset the SafeAreaView already adds) is reliable
  // on both platforms and every device size.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, e => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  // Bottom spacing for the composer, split by platform because the two OSes handle
  // the keyboard differently:
  //  • Android (edge-to-edge) already resizes the window above the keyboard, so
  //    adding the keyboard height here would double-count and leave a gap — we only
  //    clear the nav bar when the keyboard is down.
  //  • iOS does NOT resize, so we lift the composer by the keyboard height ourselves.
  // The SafeAreaView below does not claim the bottom edge, so this is the only
  // bottom spacing (no double-count from safe-area padding).
  const bottomPad = Platform.OS === 'ios'
    ? Math.max(insets.bottom, keyboardHeight)
    : (keyboardHeight > 0 ? 0 : insets.bottom);
  const [text, setText] = useState('');
  const [selectedUserModal, setSelectedUserModal] = useState<any>(null);
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Message whose "Seen by …" detail is expanded (tap to toggle, group chats).
  const [expandedSeenId, setExpandedSeenId] = useState<string | null>(null);
  // Message long-pressed to open the delete menu (delete for me / unsend).
  const [actionMsg, setActionMsg] = useState<DirectMessage | null>(null);

  const messages = messagesForConversation(conversationId);
  const event = eventId ? events.find(e => e.id === eventId) : undefined;
  const isGroupChat = recipientId === 'ALL_PARTICIPANTS' || conversationId.includes('conv_group');
  const recipientUser = !isGroupChat ? users.find(u => u.id === recipientId || u.full_name === recipientName) : undefined;
  const confirmedParticipants = eventId ? participantsFor(eventId).filter(p => p.status === 'JOINED') : [];

  // A completed (or cancelled) event's group chat is archived: history stays fully
  // readable, but no new messages are allowed. Derived from the event's status so
  // a realtime status change flips the chat to read-only without an app restart.
  const isArchived = !!event && (event.status === 'COMPLETED' || event.status === 'CANCELLED');

  // Presence + typing over an ephemeral realtime channel (no DB writes).
  const me = user ? { id: user.id, name: user.full_name } : null;
  const { onlineIds, typingUsers, sendTyping } = useChatPresence(conversationId, me);
  const typingThrottle = useRef<number>(0);

  // Read receipts: mark the conversation read whenever it is on-screen and the
  // latest message changes. One upsert per change — never per render or on
  // background-prefetched messages.
  const lastMsgId = messages.length ? messages[messages.length - 1].id : undefined;
  useEffect(() => {
    if (isFocused && user && conversationId && lastMsgId) {
      markConversationRead(conversationId, user.id);
    }
  }, [isFocused, lastMsgId, conversationId, user?.id, markConversationRead]);

  // Keep the newest message in view as messages arrive / keyboard opens.
  useEffect(() => {
    if (messages.length) {
      const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      return () => clearTimeout(t);
    }
  }, [lastMsgId]);

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

  const handleSend = () => {
    if (!text.trim() || !user || isArchived) return;
    sendDirectMessage(conversationId, eventId, user, isGroupChat ? undefined : recipientId, recipientName, text.trim(), eventTitle || event?.title);
    setText('');
    sendTyping(false); // typing indicator disappears immediately on send
    typingThrottle.current = 0;
  };

  const handleAttachPhoto = async () => {
    if (!user || isArchived) return;
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
        sendDirectMessage(conversationId, eventId, user, isGroupChat ? undefined : recipientId, recipientName, '', eventTitle || event?.title, path);
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

  // How many OTHER participants have read a given one of my messages.
  const readCountFor = useCallback((msg: DirectMessage): number | null => {
    if (msg.sender_id !== user?.id) return null;
    const myPos = messageIndex.get(msg.id);
    if (myPos === undefined) return null;
    const created = new Date(msg.created_at).getTime();
    return cursors.filter(c => {
      if (c.user_id === user?.id) return false;
      const readerPos = c.last_read_message_id !== undefined ? messageIndex.get(c.last_read_message_id) : undefined;
      if (readerPos !== undefined) return readerPos >= myPos;
      // Fallback for cursors without a message id.
      return new Date(c.last_read_at).getTime() >= created;
    }).length;
  }, [cursors, messageIndex, user?.id]);

  // The participants (other than the author and me) who have read a given message —
  // used for the tap-to-reveal "Seen by …" detail in group chats.
  const readersFor = useCallback((msg: DirectMessage) => {
    const myPos = messageIndex.get(msg.id);
    if (myPos === undefined) return [];
    const created = new Date(msg.created_at).getTime();
    return cursors
      .filter(c => c.user_id !== msg.sender_id && c.user_id !== user?.id)
      .filter(c => {
        const rp = c.last_read_message_id !== undefined ? messageIndex.get(c.last_read_message_id) : undefined;
        if (rp !== undefined) return rp >= myPos;
        return new Date(c.last_read_at).getTime() >= created;
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
    : typingUsers.length === 1 ? `${typingUsers[0].name.split(' ')[0]} is typing…`
    : typingUsers.length === 2 ? `${typingUsers[0].name.split(' ')[0]} and ${typingUsers[1].name.split(' ')[0]} are typing…`
    : `${typingUsers.length} people are typing…`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={[]}>
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
      </View>

      {isArchived && (
        <View style={[styles.archivedBanner, { backgroundColor: themeColors.textMuted + '1A', borderColor: themeColors.border }]}>
          <Ionicons name="archive-outline" size={14} color={themeColors.textMuted} />
          <Text style={[styles.archivedText, { color: themeColors.textMuted }]}>
            This conversation is archived ({event?.status === 'CANCELLED' ? 'event cancelled' : 'event completed'}). You can read past messages but can't send new ones.
          </Text>
        </View>
      )}

      {eventId && (eventTitle || event) ? (
        <TouchableOpacity
          style={[styles.eventBanner, { backgroundColor: themeColors.primary + '1A', borderColor: themeColors.primary + '3D' }]}
          onPress={() => navigation.navigate('EventDetail', { eventId })}
        >
          <Ionicons name={isGroupChat ? 'calendar' : 'pricetag'} size={14} color={themeColors.primary} />
          <Text style={[styles.eventBannerText, { color: themeColors.primary }]} numberOfLines={1}>
            {isGroupChat ? 'View event details: ' : 'Inquiry regarding: '}{eventTitle || event?.title}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={themeColors.primary} />
        </TouchableOpacity>
      ) : null}

      <View style={{ flex: 1, paddingBottom: bottomPad }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.sender_id === user.id;
            const senderUser = users.find(u => u.id === item.sender_id);
            const readCount = isMe ? (readCountFor(item) ?? 0) : 0;
            const isRead = readCount > 0;
            return (
              <SwipeableRow onDelete={() => deleteMessageForMe(item.id, user.id)}>
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
                      isMe
                        ? [styles.myBubble, { backgroundColor: themeColors.primary }]
                        : [styles.theirBubble, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }],
                      item.deleted_at && styles.deletedBubble,
                    ]}
                  >
                    {!isMe && isGroupChat && (
                      <TouchableOpacity onPress={() => senderUser && setSelectedUserModal(senderUser)}>
                        <View style={styles.senderNameRow}>
                          <Text style={[styles.senderName, { color: themeColors.primary }]}>
                            {item.sender_name} {senderUser ? `(${senderUser.position})` : ''}
                          </Text>
                          <VerifiedCheck user={senderUser} size={12} />
                        </View>
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
                      <>
                        {item.attachment_path && item.attachment_type === 'image' && (
                          <ChatImage path={item.attachment_path} onPress={setFullImageUri} onLongPress={() => setActionMsg(item)} />
                        )}
                        {!!item.text && (
                          <Text style={[styles.messageText, { color: isMe ? '#fff' : themeColors.text }]}>{item.text}</Text>
                        )}
                      </>
                    )}

                    {/* The meta row (time + ticks) is also a toggle target for the
                        "Seen by …" detail — this is the tap that works on photo
                        messages, where tapping the image opens it fullscreen. */}
                    <TouchableOpacity
                      style={styles.metaRow}
                      activeOpacity={isGroupChat ? 0.6 : 1}
                      onPress={isGroupChat ? () => setExpandedSeenId(prev => (prev === item.id ? null : item.id)) : undefined}
                    >
                      <Text style={[styles.messageTime, { color: isMe ? 'rgba(255,255,255,0.7)' : themeColors.textMuted }]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {isMe && !item.deleted_at && item.send_status === 'sending' && <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.7)" />}
                      {isMe && !item.deleted_at && item.send_status === 'failed' && (
                        <TouchableOpacity onPress={() => retryMessage(item.id)} style={styles.retryBtn}>
                          <Ionicons name="alert-circle" size={13} color="#FFD7D7" />
                          <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                      )}
                      {/* Delivery/read ticks: ✓ = sent, ✓✓ (colored) = read.
                          Group chats append the number of readers. */}
                      {isMe && !item.deleted_at && item.send_status !== 'sending' && item.send_status !== 'failed' && (
                        <View style={styles.receiptRow}>
                          <Ionicons
                            name={isRead ? 'checkmark-done' : 'checkmark'}
                            size={15}
                            color={isRead ? READ_TICK_COLOR : 'rgba(255,255,255,0.7)'}
                          />
                          {isRead && isGroupChat && (
                            <Text style={[styles.receiptCount, { color: READ_TICK_COLOR }]}>{readCount}</Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
                {isGroupChat && expandedSeenId === item.id && (() => {
                  const readers = readersFor(item);
                  return (
                    <View style={[styles.seenByRow, isMe ? styles.myWrapper : styles.seenByTheir]}>
                      {readers.length === 0 ? (
                        <Text style={[styles.seenByText, { color: themeColors.textMuted }]}>Not seen yet</Text>
                      ) : (
                        <>
                          <Text style={[styles.seenByText, { color: themeColors.textMuted }]}>
                            Seen by {readers.map(r => r.full_name.split(' ')[0]).join(', ')}
                          </Text>
                          <View style={styles.seenByAvatars}>
                            {readers.slice(0, 6).map(r => (
                              <View key={r.id} style={styles.seenByAvatar}>
                                <UserAvatar user={r} size={16} />
                              </View>
                            ))}
                          </View>
                        </>
                      )}
                    </View>
                  );
                })()}
              </View>
              </SwipeableRow>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: themeColors.textMuted }]}>
              {isGroupChat ? 'Welcome to the Event Group Chat! Send a message to start communicating.' : `No messages yet. Say hi to ${displayName}!`}
            </Text>
          }
        />

        {typingLabel ? (
          <Text style={[styles.typingLabel, { color: themeColors.textMuted }]}>{typingLabel}</Text>
        ) : null}

        {isArchived ? (
          <View style={[styles.archivedComposer, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
            <Ionicons name="lock-closed" size={14} color={themeColors.textMuted} />
            <Text style={[styles.archivedComposerText, { color: themeColors.textMuted }]}>Messaging is closed for this archived conversation</Text>
          </View>
        ) : (
          <View style={[styles.inputBar, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
            <TouchableOpacity style={styles.attachBtn} onPress={handleAttachPhoto} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color={themeColors.primary} /> : <Ionicons name="image" size={22} color={themeColors.primary} />}
            </TouchableOpacity>
            <TextInput
              style={[styles.textInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder={isGroupChat ? 'Message group chat...' : 'Type a message...'}
              placeholderTextColor={themeColors.textMuted}
              value={text}
              onChangeText={handleTextChange}
              onBlur={() => sendTyping(false)}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: themeColors.primary }, !text.trim() && styles.sendBtnDisabled]}
              disabled={!text.trim()}
              onPress={handleSend}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Long-press message menu: Messenger-style delete choices. */}
      <BottomSheet
        visible={!!actionMsg}
        onClose={() => setActionMsg(null)}
        cardStyle={[styles.menuCard, { backgroundColor: themeColors.cardBg }]}
      >
        <Text style={[styles.menuTitle, { color: themeColors.textMuted }]}>Message options</Text>
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
        onStartChat={(targetUser) => {
          setSelectedUserModal(null);
          if (targetUser.id !== recipientId) {
            const conv = getOrCreateConversation(eventId, user, targetUser.id, targetUser.full_name);
            navigation.push('Chat', {
              conversationId: conv.id,
              eventId,
              recipientId: targetUser.id,
              recipientName: targetUser.full_name,
              eventTitle,
            });
          }
        }}
      />
    </SafeAreaView>
  );
}

/** Renders a chat photo, resolving a signed URL for the private chat-media bucket. */
function ChatImage({ path, onPress, onLongPress }: { path: string; onPress: (uri: string) => void; onLongPress?: () => void }) {
  const uri = useSignedUrl('chat-media', path);
  const { colors } = useTheme();
  if (!uri) {
    return (
      <View style={[styles.chatImage, styles.chatImageLoading, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(uri)} onLongPress={onLongPress} delayLongPress={300}>
      <Image source={{ uri }} style={styles.chatImage} resizeMode="cover" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  empty: { textAlign: 'center', marginTop: 40 },
  menuCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 4 },
  menuTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 8 },
  menuLabel: { fontSize: 15, fontWeight: '700' },
  menuSub: { fontSize: 12, marginTop: 1 },
  menuCancel: { justifyContent: 'center', marginTop: 4 },
});
