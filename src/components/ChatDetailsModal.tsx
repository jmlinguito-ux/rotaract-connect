import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DirectMessage, AppUser, RotaractEvent } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useSignedUrl } from '../hooks/useSignedUrl';
import UserAvatar from './UserAvatar';
import VerifiedCheck from './VerifiedCheck';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  isGroupChat: boolean;
  otherUser?: AppUser;
  event?: RotaractEvent;
  participants: AppUser[];
  messages: DirectMessage[];
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenSearch: () => void;
  onOpenMediaGallery: () => void;
  onSelectUser: (user: AppUser) => void;
  onNavigateEvent?: (eventId: string) => void;
}

function MediaPreviewThumb({
  path,
  onPress,
}: {
  path: string;
  onPress: () => void;
}) {
  const uri = useSignedUrl('chat-media', path);
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.mediaThumbWrap, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.mediaThumbImage} resizeMode="cover" />
      ) : (
        <Ionicons name="image-outline" size={20} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

export default function ChatDetailsModal({
  visible,
  onClose,
  isGroupChat,
  otherUser,
  event,
  participants,
  messages,
  isMuted,
  onToggleMute,
  onOpenSearch,
  onOpenMediaGallery,
  onSelectUser,
  onNavigateEvent,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isNightMode } = useTheme();

  // Photo attachments in this conversation
  const mediaMessages = useMemo(() => {
    return messages
      .filter(m => !!m.attachment_path && m.attachment_type === 'image' && !m.deleted_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [messages]);

  const previewPhotos = useMemo(() => mediaMessages.slice(0, 6), [mediaMessages]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.cardBg }]}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {isGroupChat ? 'Group Details' : 'Chat Info'}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          {/* Main Info Hero */}
          <View style={[styles.heroCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            {isGroupChat ? (
              <View style={styles.heroCenter}>
                <View style={[styles.groupAvatarCircle, { backgroundColor: colors.primary + '20' }]}>
                  <Ionicons name="people" size={36} color={colors.primary} />
                </View>
                <Text style={[styles.heroTitle, { color: colors.text }]}>
                  {event ? event.title : 'Group Conversation'}
                </Text>
                {event && (
                  <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
                    {event.event_type?.replace(/_/g, ' ') || 'Event Chat'} • {participants.length} {participants.length === 1 ? 'member' : 'members'}
                  </Text>
                )}
              </View>
            ) : otherUser ? (
              <View style={styles.heroCenter}>
                <UserAvatar user={otherUser} size={72} />
                <View style={styles.nameRow}>
                  <Text style={[styles.heroTitle, { color: colors.text }]}>{otherUser.full_name}</Text>
                  <VerifiedCheck user={otherUser} size={18} />
                </View>
                <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
                  {otherUser.position} • {otherUser.club_name || 'Rotaractor'}
                </Text>
              </View>
            ) : null}

            {/* Quick Action Tiles */}
            <View style={styles.actionGrid}>
              <TouchableOpacity
                style={[styles.actionTile, { backgroundColor: colors.surface }]}
                onPress={onToggleMute}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: isMuted ? '#EF4444' + '20' : colors.primary + '20' }]}>
                  <Ionicons
                    name={isMuted ? 'notifications-off' : 'notifications'}
                    size={20}
                    color={isMuted ? '#EF4444' : colors.primary}
                  />
                </View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>
                  {isMuted ? 'Unmute' : 'Mute'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionTile, { backgroundColor: colors.surface }]}
                onPress={() => {
                  onClose();
                  onOpenSearch();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: colors.primary + '20' }]}>
                  <Ionicons name="search" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Search</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionTile, { backgroundColor: colors.surface }]}
                onPress={() => {
                  onClose();
                  onOpenMediaGallery();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: colors.primary + '20' }]}>
                  <Ionicons name="images" size={20} color={colors.primary} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>Media</Text>
              </TouchableOpacity>

              {isGroupChat && event && onNavigateEvent ? (
                <TouchableOpacity
                  style={[styles.actionTile, { backgroundColor: colors.surface }]}
                  onPress={() => {
                    onClose();
                    onNavigateEvent(event.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="calendar" size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text }]}>Event</Text>
                </TouchableOpacity>
              ) : !isGroupChat && otherUser ? (
                <TouchableOpacity
                  style={[styles.actionTile, { backgroundColor: colors.surface }]}
                  onPress={() => {
                    onClose();
                    onSelectUser(otherUser);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionIconCircle, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.actionLabel, { color: colors.text }]}>Profile</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Shared Media Section */}
          <View style={[styles.sectionCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="images-outline" size={18} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Shared Media</Text>
              </View>
              {mediaMessages.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onOpenMediaGallery();
                  }}
                >
                  <Text style={[styles.seeAllText, { color: colors.primary }]}>
                    See All ({mediaMessages.length})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {previewPhotos.length === 0 ? (
              <Text style={[styles.emptySectionText, { color: colors.textMuted }]}>
                No photos shared in this conversation yet.
              </Text>
            ) : (
              <View style={styles.mediaPreviewGrid}>
                {previewPhotos.map(m => (
                  <MediaPreviewThumb
                    key={m.id}
                    path={m.attachment_path || ''}
                    onPress={() => {
                      onClose();
                      onOpenMediaGallery();
                    }}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Participants Section (Group Chat) */}
          {isGroupChat && (
            <View style={[styles.sectionCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="people-outline" size={18} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Participants ({participants.length})
                  </Text>
                </View>
              </View>

              <View style={styles.participantsList}>
                {participants.map(member => (
                  <TouchableOpacity
                    key={member.id}
                    style={[styles.memberRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      onClose();
                      onSelectUser(member);
                    }}
                    activeOpacity={0.7}
                  >
                    <UserAvatar user={member} size={38} />
                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text style={[styles.memberName, { color: colors.text }]}>{member.full_name}</Text>
                        <VerifiedCheck user={member} size={14} />
                      </View>
                      <Text style={[styles.memberPosition, { color: colors.textMuted }]}>
                        {member.position} {member.club_name ? `• ${member.club_name}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heroCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  heroCenter: {
    alignItems: 'center',
    marginBottom: 18,
  },
  groupAvatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 13,
    marginTop: 3,
    textAlign: 'center',
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  actionTile: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptySectionText: {
    fontSize: 13,
    paddingVertical: 8,
  },
  mediaPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaThumbWrap: {
    width: (SCREEN_WIDTH - 64 - 16) / 3,
    height: (SCREEN_WIDTH - 64 - 16) / 3,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaThumbImage: {
    width: '100%',
    height: '100%',
  },
  participantsList: {
    gap: 0,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
  },
  memberPosition: {
    fontSize: 12,
    marginTop: 2,
  },
});
