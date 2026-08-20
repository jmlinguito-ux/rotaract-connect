import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { usePreferences } from '../context/PreferencesContext';
import { navigate } from '../navigation/navigationRef';
import RotaractNotifications from '../../modules/rotaract-notifications';
import {
  configurePushNotifications,
  registerForPushNotificationsAsync,
  unregisterPushTokenAsync,
} from '../services/push';
import { dispatchLocalAlert } from '../services/emergencyBroadcast';

/** Deep-link payload carried by every push (set by the send-push Edge Function or local notification). */
interface PushData {
  /** Absent on group-chat pushes, which are sent straight from the message row. */
  notificationId?: string;
  kind?: string;
  type?: string;
  title?: string;
  body?: string;
  event_id?: string;
  eventId?: string;
  application_id?: string;
  conversation_id?: string;
  broadcastId?: string;
  user_id?: string;
  full_name?: string;
  club_id?: string;
  club_name?: string;
  address_hint?: string;
  message?: string;
  avatar_url?: string;
  contact_number?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Headless bridge for OS push notifications:
 *   • registers/removes this device's Expo token as auth + the Push preference change
 *   • routes a tapped notification to the same destination the in-app banner uses,
 *     including a cold start from a fully terminated app
 * Renders nothing. Mounted inside the NavigationContainer so `navigate` is ready.
 */
export function PushNotifications() {
  const { user } = useAuth();
  const { pushEnabled, loaded } = usePreferences();
  const {
    conversations, users, events,
    canAccessEventGroupChat, getOrCreateEventGroupConversation, markConversationRead,
  } = useData();

  const [pending, setPending] = useState<PushData | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Foreground policy + Android channels, once. (Native only.)
  useEffect(() => { if (Platform.OS !== 'web') configurePushNotifications(); }, []);

  // Keep the device's token in step with who's signed in and their preference.
  // Sign-OUT removal is handled in AuthContext.signOut, which deletes the token
  // BEFORE clearing the session (the delete is RLS-scoped to auth.uid()); doing it
  // reactively here would run after the session is gone and silently delete nothing.
  useEffect(() => {
    if (!loaded || !user) return;
    if (pushEnabled) {
      registerForPushNotificationsAsync(user.id);
    } else {
      // Push turned off while still signed in — remove the token (still authenticated).
      unregisterPushTokenAsync();
    }
  }, [user?.id, pushEnabled, loaded]);

  // Capture taps: live responses while running, plus the last response that
  // launched the app from a terminated state. Native only — these APIs throw on web.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    // The DISMISS action button must NOT navigate — only a tap on the notification
    // body (DEFAULT_ACTION_IDENTIFIER) or an explicit REPLY / VIEW opens a screen.
    const accept = (resp: Notifications.NotificationResponse) => {
      // Any interaction counts as "seen" — silence a looping urgent alert.
      RotaractNotifications?.stopUrgentAlert();
      if (resp.actionIdentifier === 'dismiss') return;
      const content = resp.notification.request.content;
      const rawData = (content.data ?? {}) as PushData;
      setPending({
        ...rawData,
        title: content.title || rawData.title,
        body: content.body || rawData.body,
      });
    };
    const sub = Notifications.addNotificationResponseReceivedListener(accept);
    Notifications.getLastNotificationResponseAsync().then(resp => {
      if (resp) accept(resp);
    });
    return () => sub.remove();
  }, []);

  // Opening the app is also "seen": an urgent alert must not keep sounding while
  // the user is looking at it.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') RotaractNotifications?.stopUrgentAlert();
    });
    return () => sub.remove();
  }, []);

  const routeTo = useCallback((data: PushData): boolean => {
    if (!user) return false;

    // 1. Emergency SOS Broadcast tap -> open Map & trigger distress modal
    if (data.type === 'EMERGENCY_SOS' || data.kind === 'EMERGENCY_SOS' || data.kind === 'EMERGENCY_BROADCAST') {
      const rawTitle = data.title || '';
      const rawBody = data.body || '';

      const broadcasterName = data.full_name || rawTitle.replace(/^🚨\s*(?:EMERGENCY\s*SOS|NEARBY\s*EMERGENCY|SOS):\s*/i, '').trim() || 'Rotaract Member in Distress';
      const broadcaster = users.find(u => (data.user_id && u.id === data.user_id) || (u.full_name && u.full_name.toLowerCase() === broadcasterName.toLowerCase()));

      const clubMatch = rawBody.match(/\((Rotaract Club of [^)]+|RC [^)]+|District 3800)\)/i);
      const clubName = data.club_name || (clubMatch ? clubMatch[1] : (broadcaster?.club_name || 'District 3800'));

      const msgMatch = rawBody.match(/"([^"]+)"/);
      const customNote = data.message || (msgMatch ? msgMatch[1] : '');

      const coordsMatch = rawBody.match(/maps\.google\.com\/\?q=([0-9.-]+),([0-9.-]+)/);
      const lat = typeof data.latitude === 'number' ? data.latitude : (coordsMatch ? parseFloat(coordsMatch[1]) : 14.6948);
      const lng = typeof data.longitude === 'number' ? data.longitude : (coordsMatch ? parseFloat(coordsMatch[2]) : 120.9664);

      const addrMatch = rawBody.match(/near\s+(.*?)(?:\.|\"|\s+Map:|\s+Location:|$)/i);
      const addressHint = data.address_hint || (addrMatch ? addrMatch[1].trim() : (customNote ? 'Coordinates provided' : (rawBody || 'Location coordinates provided')));

      dispatchLocalAlert({
        id: data.broadcastId || data.notificationId || `sos_${Date.now()}`,
        user_id: data.user_id || broadcaster?.id || '',
        full_name: broadcaster?.full_name || broadcasterName,
        avatar_url: data.avatar_url || broadcaster?.avatar_url,
        club_id: data.club_id || broadcaster?.club_id || '',
        club_name: clubName,
        contact_number: data.contact_number || broadcaster?.contact_number,
        latitude: lat,
        longitude: lng,
        status: 'ACTIVE',
        map_url: `https://maps.google.com/?q=${lat},${lng}`,
        address_hint: addressHint,
        message: customNote || undefined,
        created_at: new Date().toISOString(),
      });
      navigate('Main', { screen: 'MapTab' } as any);
      return true;
    }

    // 2. Chat messages
    if (data.conversation_id) {
      const conv = conversations.find(c => c.id === data.conversation_id);
      if (conv?.is_group) {
        navigate('Chat', {
          conversationId: conv.id,
          eventId: conv.event_id,
          recipientId: 'ALL_PARTICIPANTS',
          recipientName: `${conv.event_title ?? 'Event'} Group Chat`,
          eventTitle: conv.event_title,
        });
        return true;
      }
      if (conv) {
        const otherId = conv.participant_user_id === user.id ? conv.organizer_user_id : conv.participant_user_id;
        const other = otherId ? users.find(u => u.id === otherId) : undefined;
        navigate('Chat', {
          conversationId: conv.id,
          eventId: conv.event_id,
          recipientId: other?.id ?? '',
          recipientName: other?.full_name ?? conv.participant_name ?? 'Rotaractor',
          eventTitle: conv.event_title,
        });
        return true;
      }
      // Conversation not synced yet: a group broadcast can still open its event.
      const targetEventId = data.event_id || data.eventId;
      if (targetEventId) {
        const ev = events.find(e => e.id === targetEventId);
        if (ev && canAccessEventGroupChat(ev.id, user.id)) {
          const group = getOrCreateEventGroupConversation(ev.id);
          navigate('Chat', {
            conversationId: group.id,
            eventId: ev.id,
            recipientId: 'ALL_PARTICIPANTS',
            recipientName: `${ev.title} Group Chat`,
            eventTitle: ev.title,
          });
          return true;
        }
      }
      return false; // wait for data to sync, then retry
    }

    // 3. Event Detail & Reminders
    const targetEventId = data.event_id || data.eventId;
    if (targetEventId) {
      navigate('EventDetail', { eventId: targetEventId });
      return true;
    }

    // 4. Membership application review
    if (data.application_id) {
      navigate('ApplicationReview', { applicationId: data.application_id });
      return true;
    }

    // 5. Fallback: Inbox Tab
    navigate('Main', { screen: 'InboxTab' } as any);
    return true;
  }, [user, conversations, users, events, canAccessEventGroupChat, getOrCreateEventGroupConversation, markConversationRead]);

  // Resolve the pending tap once the needed data is present; retry as data syncs.
  useEffect(() => {
    if (!pending) return;
    if (routeTo(pending)) {
      setPending(null);
      if (fallbackTimer.current) { clearTimeout(fallbackTimer.current); fallbackTimer.current = null; }
      return;
    }
    // Data not ready (e.g. cold start still hydrating). Give it a moment, then
    // fall back to the Inbox so a tap never silently does nothing.
    if (!fallbackTimer.current) {
      fallbackTimer.current = setTimeout(() => {
        navigate('Main', { screen: 'InboxTab' } as any);
        setPending(null);
        fallbackTimer.current = null;
      }, 5000);
    }
  }, [pending, routeTo]);

  return null;
}
