import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useKeyboardOffset } from './keyboard/useKeyboardOffset';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra styling for the white sheet card (radius/padding live with the caller). */
  cardStyle?: ViewStyle | ViewStyle[];
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

/**
 * Bottom sheet with a backdrop that fades in while only the card slides up.
 *
 * Modal's own `animationType="slide"` translates the whole modal — backdrop
 * included — so the dimmed layer reads as a black rectangle sliding up the
 * screen instead of the page darkening in place. We drive the animation
 * ourselves and leave the Modal itself un-animated.
 */
export function BottomSheet({ visible, onClose, children, cardStyle }: BottomSheetProps) {
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(SCREEN_HEIGHT * 0.5);
  const progress = useRef(new Animated.Value(0)).current;
  const keyboardOffset = useKeyboardOffset();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, progress]);

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight, 0],
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: progress },
            // iOS is handled by KeyboardAvoidingView above; Android runs
            // edge-to-edge where that is inert, so lift the bottom-anchored card
            // by the live keyboard height instead.
            Platform.OS === 'android' && keyboardOffset > 0 ? { paddingBottom: keyboardOffset } : null,
          ]}
        >
          <Pressable style={styles.backdropPress} onPress={onClose} />
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: themeColors.cardBg },
              cardStyle,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
              { transform: [{ translateY }] },
            ]}
            onLayout={e => setSheetHeight(e.nativeEvent.layout.height)}
          >
            {children}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdropPress: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
});
