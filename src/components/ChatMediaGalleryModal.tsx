import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DirectMessage } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useSignedUrl } from '../hooks/useSignedUrl';
import FullImageModal from './FullImageModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const NUM_COLUMNS = 3;
const THUMB_SIZE = (SCREEN_WIDTH - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface Props {
  visible: boolean;
  messages: DirectMessage[];
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
}

function GalleryThumbnail({
  message,
  onPress,
}: {
  message: DirectMessage;
  onPress: (uri: string, msg: DirectMessage) => void;
}) {
  const uri = useSignedUrl('chat-media', message.attachment_path || '');
  const { colors } = useTheme();

  if (!uri) {
    return (
      <View style={[styles.thumbLoading, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.thumbWrap}
      onPress={() => onPress(uri, message)}
    >
      <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
    </TouchableOpacity>
  );
}

export default function ChatMediaGalleryModal({
  visible,
  messages,
  onClose,
  onJumpToMessage,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isNightMode } = useTheme();
  const [selectedPhoto, setSelectedPhoto] = useState<{ uri: string; message: DirectMessage } | null>(null);

  // Filter messages with image attachments, sorted newest first
  const mediaMessages = useMemo(() => {
    return messages
      .filter(m => !!m.attachment_path && m.attachment_type === 'image' && !m.deleted_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [messages]);

  const handleOpenPhoto = (uri: string, msg: DirectMessage) => {
    setSelectedPhoto({ uri, message: msg });
  };

  const formatMessageDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

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
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Shared Media</Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              {mediaMessages.length} {mediaMessages.length === 1 ? 'photo' : 'photos'}
            </Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {/* Media Grid */}
        {mediaMessages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface }]}>
              <Ionicons name="images-outline" size={42} color={colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Media Shared Yet</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              Photos shared in this conversation will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={mediaMessages}
            keyExtractor={item => item.id}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContainer}
            columnWrapperStyle={{ gap: GRID_GAP }}
            renderItem={({ item }) => (
              <GalleryThumbnail message={item} onPress={handleOpenPhoto} />
            )}
          />
        )}

        {/* Full Image Preview with Jump to Chat */}
        {selectedPhoto && (
          <FullImageModal
            visible={!!selectedPhoto}
            imageUri={selectedPhoto.uri}
            title="Shared Photo"
            senderName={selectedPhoto.message.sender_name}
            sentAt={formatMessageDate(selectedPhoto.message.created_at)}
            presentation="overlay"
            onClose={() => setSelectedPhoto(null)}
            onJumpToMessage={() => {
              const msgId = selectedPhoto.message.id;
              setSelectedPhoto(null);
              onClose();
              onJumpToMessage(msgId);
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  gridContainer: {
    paddingVertical: 2,
    gap: GRID_GAP,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbLoading: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
