import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
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
import { UserProfileModal } from '../../components/UserProfileModal';
import { useChatPresence } from '../../hooks/useChatPresence';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { uploadImageAsset } from '../../services/storage';
import { DirectMessage } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
  const { conversationId, eventId, recipientId, recipientName, eventTitle } = route.params;
  const { user } = useAuth();
  const {
    messagesForConversation, sendDirectMessage, retryMessage, events, users, participantsFor,
    getOrCreateConversation, markConversationRead, readCursorsFor,
  } = useData();
  const { colors: themeColors } = useTheme();
  const headerHeight = useHeaderHeight();
  const isFocused = useIsFocused();
  const listRef = useRef<FlatList>(null);
  const [text, setText] = useState('');
  const [selectedUserModal, setSelectedUserModal] = useState<any>(null);
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
  const cursors = readCursorsFor(conversationId);
  const seenSummary = useCallback((msg: DirectMessage): string | null => {
    if (msg.sender_id !== user?.id) return null;
    const created = new Date(msg.created_at).getTime();
    const readers = cursors.filter(c => c.user_id !== user?.id && new Date(c.last_read_at).getTime() >= created);
    if (isGroupChat) {
      if (readers.length === 0) return null;
      return `Seen by ${readers.length}`;
    }
    return readers.length > 0 ? 'Seen' : null;
  }, [cursors, user?.id, isGroupChat]);

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

  const lastMyMessageId = [...messages].reverse().find(m => m.sender_id === user.id)?.id;

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
      </View>

      {isArchived && (
        <View style={[styles.archivedBanner, { backgroundColor: themeColors.textMuted + '1A', borderColor: themeColors.border }]}>
          <Ionicons name="archive-outline" size={14} color={themeColors.textMuted} />
          <Text style={[styles.archivedText, { color: themeColors.textMuted }]}>
            This conversation is archived ({event?.status === 'CANCELLED' ? 'event cancelled' : 'event completed'}). You can read past messages but can't send new ones.
          </Text>
        </View>
      )}

      {!isGroupChat && (eventTitle || event) ? (
        <TouchableOpacity
          style={[styles.eventBanner, { backgroundColor: themeColors.primary + '1A', borderColor: themeColors.primary + '3D' }]}
          onPress={() => { if (eventId) navigation.navigate('EventDetail', { eventId }); }}
        >
          <Ionicons name="pricetag" size={14} color={themeColors.primary} />
          <Text style={[styles.eventBannerText, { color: themeColors.primary }]} numberOfLines={1}>
            Inquiry regarding: {eventTitle || event?.title}
          </Text>
          {eventId && <Ionicons name="chevron-forward" size={14} color={themeColors.primary} />}
        </TouchableOpacity>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.sender_id === user.id;
            const senderUser = users.find(u => u.id === item.sender_id);
            const seen = item.id === lastMyMessageId ? seenSummary(item) : null;
            return (
              <View>
                <View style={[styles.messageWrapper, isMe ? styles.myWrapper : styles.theirWrapper]}>
                  {!isMe && (
                    <TouchableOpacity onPress={() => senderUser && setSelectedUserModal(senderUser)}>
                      <UserAvatar user={senderUser ?? { full_name: item.sender_name }} size={28} />
                    </TouchableOpacity>
                  )}
                  <View
                    style={[
                      styles.bubble,
                      isMe
                        ? [styles.myBubble, { backgroundColor: themeColors.primary }]
                        : [styles.theirBubble, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }],
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

                    {item.attachment_path && item.attachment_type === 'image' && (
                      <ChatImage path={item.attachment_path} onPress={setFullImageUri} />
                    )}
                    {!!item.text && (
                      <Text style={[styles.messageText, { color: isMe ? '#fff' : themeColors.text }]}>{item.text}</Text>
                    )}

                    <View style={styles.metaRow}>
                      <Text style={[styles.messageTime, { color: isMe ? 'rgba(255,255,255,0.7)' : themeColors.textMuted }]}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {isMe && item.send_status === 'sending' && <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.7)" />}
                      {isMe && item.send_status === 'sent' && <Ionicons name="checkmark" size={13} color="rgba(255,255,255,0.7)" />}
                      {isMe && item.send_status === 'failed' && (
                        <TouchableOpacity onPress={() => retryMessage(item.id)} style={styles.retryBtn}>
                          <Ionicons name="alert-circle" size={13} color="#FFD7D7" />
                          <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
                {seen ? (
                  <Text style={[styles.seenText, { color: themeColors.textMuted }]}>{seen}</Text>
                ) : null}
              </View>
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
      </KeyboardAvoidingView>

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
function ChatImage({ path, onPress }: { path: string; onPress: (uri: string) => void }) {
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
    <TouchableOpacity activeOpacity={0.9} onPress={() => onPress(uri)}>
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
  senderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  senderName: { fontSize: 11, fontWeight: '700' },
  messageText: { fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 4 },
  messageTime: { fontSize: 10 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  retryText: { fontSize: 10, color: '#FFD7D7', fontWeight: '700' },
  seenText: { fontSize: 10, alignSelf: 'flex-end', marginTop: 2, marginRight: 4 },
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
});
