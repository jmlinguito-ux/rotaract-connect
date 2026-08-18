import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { setWriteErrorListener } from '../services/db';

/**
 * Surfaces persistence failures. Writes are fire-and-forget (see db.ts), so a
 * failed save would otherwise be invisible and the local state would silently
 * diverge from the server. When a write fails this slides a transient banner up
 * from the bottom telling the user to pull to refresh (which reconciles state).
 *
 * Failures are debounced so a burst of failing writes shows one banner, and it
 * auto-dismisses. Rendered once, app-wide.
 */
export function SyncErrorBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(120)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShownAt = useRef(0);

  useEffect(() => {
    setWriteErrorListener(() => {
      // Debounce: at most one banner per 5s window, no matter how many writes fail.
      const now = Date.now();
      if (now - lastShownAt.current < 5000) return;
      lastShownAt.current = now;
      setVisible(true);
    });
    return () => setWriteErrorListener(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(translateY, { toValue: 120, duration: 220, useNativeDriver: true })
        .start(() => setVisible(false));
    }, 4000);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [visible, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { bottom: insets.bottom + 16, transform: [{ translateY }] }]}
    >
      <View style={[styles.card, { backgroundColor: colors.text }]}>
        <Ionicons name="cloud-offline-outline" size={18} color="#fff" />
        <Text style={styles.text} numberOfLines={2}>
          Some changes didn't save. Check your connection, then pull down to refresh.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
