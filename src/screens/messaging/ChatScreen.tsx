import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import UserAvatar from '../../components/UserAvatar';
import VerifiedCheck, { VerifiedName } from '../../components/VerifiedCheck';
import { UserProfileModal } from '../../components/UserProfileModal';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
  const { conversationId, eventId, recipientId, recipientName, eventTitle } = route.params;
  const { user } = useAuth();
  const { messagesForConversation, sendDirectMessage, events, users, participantsFor, getOrCreateConversation } = useData();
  const { colors: themeColors } = useTheme();
  const [text, setText] = useState('');
  const [selectedUserModal, setSelectedUserModal] = useState<any>(null);

  const messages = messagesForConversation(conversationId);
  const event = eventId ? events.find(e => e.id === eventId) : undefined;
  const isGroupChat = recipientId === 'ALL_PARTICIPANTS' || conversationId.includes('conv_group');
  const recipientUser = !isGroupChat ? users.find(u => u.id === recipientId || u.full_name === recipientName) : undefined;
  const confirmedParticipants = eventId ? participantsFor(eventId).filter(p => p.status === 'JOINED') : [];

  const handleSend = () => {
    if (!text.trim() || !user) return;
    // Group messages have no single receiver — they fan out to every JOINED participant.
    sendDirectMessage(conversationId, eventId, user, isGroupChat ? undefined : recipientId, recipientName, text.trim(), eventTitle || event?.title);
    setText('');
  };

  if (!user) return null;

  const displayName = isGroupChat ? `${eventTitle || event?.title || 'Event'} Group Chat` : recipientUser?.full_name || recipientName;
  const displayClub = isGroupChat ? `${confirmedParticipants.length} confirmed participants` : recipientUser?.club_name || 'Rotaract Club';
  const displayPosition = isGroupChat ? 'Official Event Chat' : recipientUser?.position || 'Rotaractor';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      {/* Header Card */}
      <View style={[styles.userHeaderCard, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border }]}>
        {isGroupChat ? (
          <TouchableOpacity
            style={[styles.avatarCircle, { backgroundColor: themeColors.primary }]}
            onPress={() => {
              if (eventId) navigation.navigate('Participants', { eventId });
            }}
          >
            <Ionicons name="chatbubbles" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => recipientUser && setSelectedUserModal(recipientUser)}>
            <UserAvatar user={recipientUser ?? { full_name: displayName }} size={44} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={0.7}
          onPress={() => {
            if (!isGroupChat && recipientUser) {
              setSelectedUserModal(recipientUser);
            } else if (eventId) {
              navigation.navigate('Participants', { eventId });
            }
          }}
        >
          <View style={styles.nameRow}>
            <Text style={[styles.userName, { color: themeColors.text }]} numberOfLines={1}>{displayName}</Text>
            {!isGroupChat && <VerifiedCheck user={recipientUser} size={15} />}
          </View>
          <Text style={[styles.userSub, { color: themeColors.textMuted }]} numberOfLines={1}>
            {displayPosition} • {displayClub}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Event Context Banner for Direct Messages */}
      {!isGroupChat && (eventTitle || event) ? (
        <TouchableOpacity
          style={[styles.eventBanner, { backgroundColor: themeColors.primary + '1A', borderColor: themeColors.primary + '3D' }]}
          onPress={() => {
            if (eventId) navigation.navigate('EventDetail', { eventId });
          }}
        >
          <Ionicons name="pricetag" size={14} color={themeColors.primary} />
          <Text style={[styles.eventBannerText, { color: themeColors.primary }]} numberOfLines={1}>
            Inquiry regarding: {eventTitle || event?.title}
          </Text>
          {eventId && <Ionicons name="chevron-forward" size={14} color={themeColors.primary} />}
        </TouchableOpacity>
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => {
            const isMe = item.sender_id === user.id;
            const senderUser = users.find(u => u.id === item.sender_id);
            return (
              <View style={[styles.messageWrapper, isMe ? styles.myWrapper : styles.theirWrapper]}>
                {!isMe && (
                  <TouchableOpacity onPress={() => senderUser && setSelectedUserModal(senderUser)}>
                    <UserAvatar
                      user={senderUser ?? { full_name: item.sender_name }}
                      size={28}
                    />
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
                  {!isMe && (
                    <TouchableOpacity onPress={() => senderUser && setSelectedUserModal(senderUser)}>
                      <View style={styles.senderNameRow}>
                        <Text style={[styles.senderName, { color: themeColors.primary }]}>
                          {item.sender_name} {senderUser ? `(${senderUser.position})` : ''}
                        </Text>
                        <VerifiedCheck user={senderUser} size={12} />
                      </View>
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.messageText, { color: isMe ? '#fff' : themeColors.text }]}>{item.text}</Text>
                  <Text style={[styles.messageTime, { color: isMe ? 'rgba(255,255,255,0.7)' : themeColors.textMuted }]}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: themeColors.textMuted }]}>
              {isGroupChat ? 'Welcome to the Event Group Chat! Send a message to start communicating.' : `No messages yet. Say hi to ${displayName}!`}
            </Text>
          }
        />

        <View style={[styles.inputBar, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
          <TextInput
            style={[styles.textInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder={isGroupChat ? 'Message group chat...' : 'Type a message...'}
            placeholderTextColor={themeColors.textMuted}
            value={text}
            onChangeText={setText}
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
      </KeyboardAvoidingView>

      {/* Member Profile Modal */}
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

const styles = StyleSheet.create({
  safe: { flex: 1 },
  userHeaderCard: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerAvatarImg: { width: '100%', height: '100%', borderRadius: 22 },
  avatarInitials: { color: '#fff', fontSize: 16, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 15, fontWeight: '700' },
  userSub: { fontSize: 12, marginTop: 1 },
  viewEventBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  eventBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  eventBannerText: { flex: 1, fontSize: 12, fontWeight: '700' },
  messageList: { padding: 16, paddingBottom: 24, gap: 12 },
  messageWrapper: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  myWrapper: { justifyContent: 'flex-end' },
  theirWrapper: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  msgAvatarText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  bubble: { maxWidth: '78%', padding: 12, borderRadius: 16 },
  myBubble: { borderBottomRightRadius: 4 },
  theirBubble: { borderBottomLeftRadius: 4, borderWidth: 1 },
  senderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  senderName: { fontSize: 11, fontWeight: '700' },
  messageText: { fontSize: 14, lineHeight: 20 },
  messageTime: { fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  textInput: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 100, fontSize: 15 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  empty: { textAlign: 'center', marginTop: 40 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  profileModalCard: { width: '100%', borderRadius: 20, padding: 24, alignItems: 'center' },
  closeModalBtn: { position: 'absolute', top: 14, right: 14, padding: 6 },
  modalAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modalAvatarText: { color: '#fff', fontSize: 24, fontWeight: '800' },
  modalName: { fontSize: 18, fontWeight: '800' },
  modalVerifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 6, marginBottom: 12 },
  modalVerifiedText: { fontSize: 11, fontWeight: '700' },
  profileDetails: { width: '100%', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13 },
  detailLabel: { fontWeight: '600' },
});
