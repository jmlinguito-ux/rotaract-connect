import React from 'react';
import { Modal, View, Image, TouchableOpacity, StyleSheet, Text, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  imageUri: string | null;
  title?: string;
  onClose: () => void;
  /**
   * How to present. 'modal' (default) is correct at screen level.
   *
   * Use 'overlay' when this is rendered inside another <Modal>: iOS presents a
   * Modal as a view controller and will not present a second one on top of an
   * already-presented one, so the image silently never appears (Android stacks
   * them happily, which is why this only breaks on iOS). 'overlay' renders an
   * absolutely-positioned view instead, which composes inside any parent.
   */
  presentation?: 'modal' | 'overlay';
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function FullImageModal({ visible, imageUri, title, onClose, presentation = 'modal' }: Props) {
  // Read the inset directly rather than wrapping in SafeAreaView: the header is
  // absolutely positioned, so SafeAreaView's padding does not move it clear of the
  // status bar and the close button ended up under the clock.
  const insets = useSafeAreaInsets();

  if (!visible || !imageUri) return null;

  const content = (
    <View style={[styles.container, presentation === 'overlay' && styles.overlay]}>
        <View style={[styles.header, { top: insets.top + 12 }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
        </View>

        <TouchableOpacity style={styles.imageWrap} activeOpacity={1} onPress={onClose}>
          <Image
            source={{ uri: imageUri }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        </TouchableOpacity>
    </View>
  );

  if (presentation === 'overlay') return content;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  imageWrap: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
});
