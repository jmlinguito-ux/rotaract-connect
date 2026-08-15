import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, Vibration, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AppNotification } from '../types';
import { navigate } from '../navigation/navigationRef';

/**
 * Foreground, in-app banner for realtime notifications. When a new notification
 * arrives for the signed-in user it slides in from the top; tapping it deep-links
 * to the related content. HIGH priority triggers a vibration (OS settings
 * permitting). Native push for BACKGROUNDED apps requires expo-notifications +
 * EAS credentials — see the PR notes.
 */
export function InAppNotificationBanner() {
  const { notifications } = useData();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<AppNotification | null>(null);
  const translateY = useRef(new Animated.Value(-200)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ignore everything already present on first mount; only surface genuinely new ones.
  const seenIds = useRef<Set<string> | null>(null);

  const myNotifs = user ? notifications.filter(n => n.user_id === user.id) : [];
  const latest = myNotifs.length
    ? myNotifs.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
    : undefined;

  useEffect(() => {
    if (!user) return;
    if (seenIds.current === null) {
      seenIds.current = new Set(myNotifs.map(n => n.id));
      return;
    }
    if (!latest || seenIds.current.has(latest.id)) return;
    seenIds.current.add(latest.id);
    if (latest.is_read) return; // don't pop a banner for something already read elsewhere

    setBanner(latest);
    if (latest.priority === 'HIGH') {
      Vibration.vibrate(Platform.OS === 'ios' ? [0, 200, 100, 200] : 400);
    } else if (latest.priority === 'ALERT') {
      Vibration.vibrate(200);
    }

    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(dismiss, latest.priority === 'HIGH' ? 7000 : 4500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, user?.id]);

  const dismiss = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    Animated.timing(translateY, { toValue: -200, duration: 220, useNativeDriver: true }).start(() => setBanner(null));
  };

  const handlePress = () => {
    const n = banner;
    dismiss();
    if (!n) return;
    if (n.conversation_id && n.event_id) {
      // Best-effort deep link to the related event; the Inbox surfaces the thread.
      navigate('EventDetail', { eventId: n.event_id });
    } else if (n.event_id) {
      navigate('EventDetail', { eventId: n.event_id });
    } else if (n.application_id) {
      navigate('ApplicationReview', { applicationId: n.application_id });
    } else {
      navigate('Notifications');
    }
  };

  if (!banner) return null;

  const accent = banner.priority === 'HIGH' ? colors.danger
    : banner.priority === 'ALERT' ? colors.warning
    : colors.primary;

  return (
    <Animated.View style={[styles.wrap, { top: insets.top + 6, transform: [{ translateY }] }]} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handlePress}
        style={[styles.card, { backgroundColor: colors.cardBg, borderColor: accent, shadowColor: '#000' }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: accent + '1F' }]}>
          <Ionicons
            name={banner.priority === 'HIGH' ? 'warning' : banner.priority === 'ALERT' ? 'notifications' : 'chatbubble-ellipses'}
            size={20}
            color={accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{banner.title}</Text>
          <Text style={[styles.message, { color: colors.textMuted }]} numberOfLines={2}>{banner.message}</Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 12, zIndex: 1000 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1,
    shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800' },
  message: { fontSize: 12, marginTop: 1 },
});
