import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { usePreferences } from '../context/PreferencesContext';
import { navigate, navigationRef } from '../navigation/navigationRef';
import RotaractNotifications from '../../modules/rotaract-notifications';
import {
  configurePushNotifications,
  registerForPushNotificationsAsync,
  unregisterPushTokenAsync,
} from '../services/push';
import { dispatchLocalAlert } from '../services/emergencyBroadcast';
import { handleAppNotificationNavigation } from '../utils/notificationRouter';

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
  const isRegistering = useRef(false);
  useEffect(() => {
    if (!loaded || !user) return;
    if (pushEnabled) {
      // Guard against concurrent calls — React Strict Mode / fast re-renders can
      // cause this effect to fire twice before the first async call completes.
      if (isRegistering.current) return;
      isRegistering.current = true;
      registerForPushNotificationsAsync(user.id).finally(() => {
        isRegistering.current = false;
      });
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

    // Wait for events data to hydrate if target event is present
    const targetEventId = data.event_id || data.eventId;
    if (targetEventId && events.length === 0) {
      return false;
    }

    handleAppNotificationNavigation(data, navigationRef as any, {
      user,
      events,
      users,
      conversations,
      dispatchLocalAlert,
    });
    return true;
  }, [user, events, users, conversations]);

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
