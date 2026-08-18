import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, Vibration, Image, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { AppNotification, DirectMessage, AppUser, NotificationPriority } from '../types';
import { navigate, navigationRef } from '../navigation/navigationRef';
import { playAlertSound, stopAlertSound } from '../services/sound';
import UserAvatar from './UserAvatar';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface BannerData {
  id: string;
  type: 'notification' | 'message';
  title: string;
  subtitle: string;
  fullMessage?: string;
  senderUser?: AppUser | { full_name: string; avatar_url?: string };
  senderName?: string;
  isGroupChat?: boolean;
  eventCoverPhoto?: string;
  attachmentPath?: string;
  conversationId?: string;
  eventId?: string;
  applicationId?: string;
  recipientId?: string;
  recipientName?: string;
  eventTitle?: string;
  priority?: NotificationPriority;
  created_at: string;
}

/**
 * High-priority Android Heads-Up Style In-App Notification Banner.
 * - Thumbnail: App logo for 1-1 / notifications, Event photo for Group Chats.
 * - Expanded view: Shows the actual profile photo and full message of the sender.
 */
export function InAppNotificationBanner() {
  const { notifications, conversations, messages, users, events } = useData();
  const { user } = useAuth();
  const { inAppBannerEnabled } = usePreferences();
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const translateY = useRef(new Animated.Value(-240)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track seen IDs so we don't pop banners for past history on mount
  const seenNotifIds = useRef<Set<string> | null>(null);
  const seenMsgIds = useRef<Set<string> | null>(null);

  // 1. Listen for new notifications
  const myNotifs = user ? notifications.filter(n => n.user_id === user.id) : [];
  const latestNotif = myNotifs.length
    ? myNotifs.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
    : undefined;

  useEffect(() => {
    if (!user) return;
    if (seenNotifIds.current === null) {
      seenNotifIds.current = new Set(myNotifs.map(n => n.id));
      return;
    }
    if (!latestNotif || seenNotifIds.current.has(latestNotif.id)) return;
    seenNotifIds.current.add(latestNotif.id);
    if (latestNotif.is_read) return;
    if (latestNotif.kind === 'INQUIRY_RECEIVED') return; // Handled by incoming messages listener
    if (!inAppBannerEnabled) return;

    // Check if user is currently looking at this conversation
    const currentRoute = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
    if (
      currentRoute?.name === 'Chat' &&
      latestNotif.conversation_id &&
      (currentRoute.params as any)?.conversationId === latestNotif.conversation_id
    ) {
      return;
    }

    const senderUser = users.find(u => u.full_name === latestNotif.title || u.id === (latestNotif as any).sender_id);
    const ev = latestNotif.event_id ? events.find(e => e.id === latestNotif.event_id) : undefined;

    triggerBanner({
      id: latestNotif.id,
      type: 'notification',
      title: latestNotif.title,
      subtitle: latestNotif.message,
      fullMessage: latestNotif.message,
      senderUser,
      senderName: senderUser?.full_name || latestNotif.title,
      isGroupChat: !!latestNotif.conversation_id && !!conversations.find(c => c.id === latestNotif.conversation_id)?.is_group,
      eventCoverPhoto: ev?.cover_photo,
      conversationId: latestNotif.conversation_id,
      eventId: latestNotif.event_id,
      applicationId: latestNotif.application_id,
      priority: latestNotif.priority,
      created_at: latestNotif.created_at,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestNotif?.id, user?.id, inAppBannerEnabled]);

  // 2. Listen for incoming direct messages and group chat messages
  const incomingMessages = user ? messages.filter(m => m.sender_id !== user.id) : [];
  const latestMsg = incomingMessages.length
    ? incomingMessages.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b))
    : undefined;

  useEffect(() => {
    if (!user) return;
    if (seenMsgIds.current === null) {
      seenMsgIds.current = new Set(incomingMessages.map(m => m.id));
      return;
    }
    if (!latestMsg || seenMsgIds.current.has(latestMsg.id)) return;
    seenMsgIds.current.add(latestMsg.id);
    if (latestMsg.deleted_at) return;
    if (!inAppBannerEnabled) return;

    // Check if user is actively in this chat screen right now
    const currentRoute = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
    if (
      currentRoute?.name === 'Chat' &&
      (currentRoute.params as any)?.conversationId === latestMsg.conversation_id
    ) {
      return;
    }

    const conv = conversations.find(c => c.id === latestMsg.conversation_id);
    const sender = users.find(u => u.id === latestMsg.sender_id);
    const ev = latestMsg.event_id ? events.find(e => e.id === latestMsg.event_id) : undefined;
    const isGroup = conv?.is_group || !!latestMsg.event_id;

    const title = isGroup ? (ev?.title || conv?.event_title || 'Group Chat') : (sender?.full_name || latestMsg.sender_name || 'Direct Message');
    const senderFullName = sender?.full_name || latestMsg.sender_name || 'Rotaractor';
    const senderFirstName = senderFullName.split(' ')[0];
    const preview = latestMsg.text?.trim()
      ? (isGroup ? `${senderFirstName}: ${latestMsg.text}` : latestMsg.text)
      : (latestMsg.attachment_path ? `${senderFirstName}: 📷 Sent a photo` : 'New message');

    triggerBanner({
      id: latestMsg.id,
      type: 'message',
      title,
      subtitle: preview,
      fullMessage: latestMsg.text?.trim() || (latestMsg.attachment_path ? '📷 Shared a photo' : 'New message'),
      senderUser: sender ?? { full_name: senderFullName },
      senderName: senderFullName,
      isGroupChat: isGroup,
      eventCoverPhoto: ev?.cover_photo,
      attachmentPath: latestMsg.attachment_path,
      conversationId: latestMsg.conversation_id,
      eventId: latestMsg.event_id,
      recipientId: isGroup ? 'ALL_PARTICIPANTS' : latestMsg.sender_id,
      recipientName: isGroup ? `${title} Group Chat` : senderFullName,
      eventTitle: ev?.title || conv?.event_title,
      created_at: latestMsg.created_at,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestMsg?.id, user?.id, inAppBannerEnabled]);

  const triggerBanner = (data: BannerData) => {
    setIsExpanded(false);
    setBanner(data);
    Vibration.cancel();
    if (data.priority === 'HIGH') {
      Vibration.vibrate([0, 700, 500], true);
      playAlertSound('HIGH');
    } else if (data.priority === 'ALERT') {
      Vibration.vibrate(300);
      playAlertSound('ALERT');
    } else {
      Vibration.vibrate([0, 100, 80, 100]);
      playAlertSound('ALERT');
    }

    Animated.spring(translateY, {
      toValue: 0,
      tension: 70,
      friction: 9,
      useNativeDriver: true,
    }).start();

    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (data.priority !== 'HIGH') {
      hideTimer.current = setTimeout(dismiss, data.priority === 'ALERT' ? 6500 : 5000);
    }
  };

  useEffect(() => () => { Vibration.cancel(); stopAlertSound(); }, []);

  const dismiss = () => {
    Vibration.cancel();
    stopAlertSound();
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(translateY, {
      toValue: -240,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setBanner(null);
      setIsExpanded(false);
    });
  };

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
    // When expanded, extend the auto-hide timer so user has time to read
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(dismiss, 10000);
    }
  };

  const handlePress = () => {
    const item = banner;
    dismiss();
    if (!item) return;

    if (item.conversationId) {
      navigate('Chat', {
        conversationId: item.conversationId,
        eventId: item.eventId,
        recipientId: item.recipientId ?? '',
        recipientName: item.recipientName ?? item.title,
        eventTitle: item.eventTitle,
      });
    } else if (item.eventId) {
      navigate('EventDetail', { eventId: item.eventId });
    } else if (item.applicationId) {
      navigate('ApplicationReview', { applicationId: item.applicationId });
    } else {
      navigate('Notifications');
    }
  };

  if (!banner) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + (insets.top > 0 ? 4 : 12), transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        {/* Top summary row */}
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={handlePress}
          style={styles.cardHeaderRow}
        >
          {/* Thumbnail: App Logo (1-1 / Notif) or Event Photo (Group Chat) */}
          <View style={styles.thumbWrap}>
            {banner.isGroupChat && banner.eventCoverPhoto ? (
              <Image source={{ uri: banner.eventCoverPhoto }} style={styles.thumbImage} />
            ) : (
              <Image source={require('../../assets/icon.png')} style={styles.thumbImage} />
            )}
            <View style={[styles.subBadge, { backgroundColor: banner.isGroupChat ? '#E11D48' : '#3B82F6' }]}>
              <Ionicons
                name={banner.isGroupChat ? 'people' : banner.type === 'message' ? 'chatbubble' : 'notifications'}
                size={8}
                color="#fff"
              />
            </View>
          </View>

          {/* Title + Preview */}
          <View style={styles.contentWrap}>
            <View style={styles.topLine}>
              <Text style={styles.titleText} numberOfLines={1}>
                {banner.title}
              </Text>
              <Text style={styles.dotSeparator}>•</Text>
              <Text style={styles.nowText}>now</Text>
              <Ionicons name="notifications" size={11} color="#FBBF24" style={styles.bellIcon} />
            </View>
            {!isExpanded && (
              <Text style={styles.subtitleText} numberOfLines={2}>
                {banner.subtitle}
              </Text>
            )}
          </View>

          {/* Toggle Expand Chevron */}
          <TouchableOpacity
            onPress={toggleExpand}
            style={styles.expandBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#94A3B8" />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* EXPANDED VIEW: Shows profile photo of sender, full message & image preview */}
        {isExpanded && (
          <View style={styles.expandedSection}>
            <View style={styles.senderProfileRow}>
              <UserAvatar
                user={banner.senderUser ?? { full_name: banner.senderName || 'Rotaractor' }}
                size={40}
                showBadge={false}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.expandedSenderName} numberOfLines={1}>
                  {banner.senderName || banner.title}
                </Text>
                <Text style={styles.expandedSenderSub}>Sent a message</Text>
              </View>
            </View>

            <Text style={styles.expandedMessageText}>
              {banner.fullMessage || banner.subtitle}
            </Text>

            {banner.attachmentPath && (
              <Image source={{ uri: banner.attachmentPath }} style={styles.expandedAttachment} resizeMode="cover" />
            )}

            {/* Expanded Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={handlePress} style={styles.replyBtn}>
                <Text style={styles.actionBtnText}>
                  {banner.type === 'message' ? 'REPLY' : 'VIEW'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={dismiss} style={styles.dismissBtn}>
                <Text style={styles.actionDismissText}>DISMISS</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#1E2026',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2F3340',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 16,
    elevation: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbWrap: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'visible',
  },
  thumbImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#111',
  },
  subBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#1E2026',
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  dotSeparator: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  nowText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  bellIcon: {
    marginLeft: 2,
  },
  subtitleText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
  },
  expandBtn: {
    padding: 4,
    alignSelf: 'center',
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333846',
  },
  senderProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  expandedSenderName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  expandedSenderSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  expandedMessageText: {
    color: '#E2E8F0',
    fontSize: 13.5,
    lineHeight: 20,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  expandedAttachment: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  replyBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  dismissBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  actionDismissText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});


