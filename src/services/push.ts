import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

/**
 * Expo push registration + OS notification configuration.
 *
 * Token presence in `push_tokens` IS the push preference: we register a token
 * when the user has push enabled AND granted OS permission, and delete it when
 * either is off. The `send-push` Edge Function only ever pushes to tokens that
 * exist, so an opted-out or unpermitted user simply receives nothing — while
 * their in-app notification history stays fully intact.
 */

// The token issued to THIS device this session, so we can delete exactly it on
// sign-out / opt-out without disturbing the user's other devices.
let currentToken: string | null = null;

function resolveProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId
  );
}

// Foreground notification display is configured in notifications.ts.
// setNotificationHandler must only be called once — a second call here would
// override shouldPlaySound:false there and cause duplicate sounds.

/**
 * Sets Android notification channels. Call once at startup.
 */
export async function configurePushNotifications() {
  if (Platform.OS === 'android') {
    // Channel settings are frozen at creation: Android ignores later edits, and
    // deleting a channel to "reset" it does NOT clear the user's own overrides
    // (they are restored if the id comes back). So changing a channel means
    // publishing a NEW id and retiring the old one exactly once — which is why
    // adding the chime meant a new generation of ids rather than an edit.
    for (const retired of [
      'default', 'messages', 'high',            // pre-versioning
      'default_v2', 'high_v2', 'messages_v2',   // no custom sound
      'chat_messages',                          // no custom sound
      'chat_v3', 'mentions_v1', 'events_v1', 'general_v3',
      'organizer_high_v1', 'organizer_alert_v1',
      'chat_v4', 'mentions_v2', 'events_v2', 'general_v4', 'organizer_alert_v2',
      'general_v5',                              // DEFAULT importance; replaced by general_v6 (HIGH)
      'emergency_sos_v1', 'emergency_sos_v2',
    ]) {
      await Notifications.deleteNotificationChannelAsync(retired).catch(() => {});
    }

    // Split by TYPE, not by importance: an organizer drowning in one category can
    // silence just that one instead of turning the app off entirely.
    //
    // Sound files must exist in android/app/src/main/res/raw. They are committed
    // there rather than generated: android/ is checked in, so `expo run:android`
    // builds the existing project and never re-runs config plugins — the
    // expo-notifications `sounds` array in app.json only applies during
    // `expo prebuild`. Both are kept in step so either path works.
    const chime = 'chime.wav';
    const alert = 'alert.wav';
    const emergency = 'emergency.wav';

    try {
      await Notifications.setNotificationChannelAsync('emergency_sos_v3', {
        name: 'Emergency SOS Broadcasts',
        description: 'Urgent emergency distress broadcasts from nearby members.',
        importance: Notifications.AndroidImportance.MAX,
        sound: emergency,
        vibrationPattern: [0, 800, 400, 800, 400, 800],
        lightColor: '#EF4444',
        showBadge: true,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    } catch {
      // Fallback to alert sound on dev builds compiled before emergency.wav was added
      try {
        await Notifications.setNotificationChannelAsync('emergency_sos_v3', {
          name: 'Emergency SOS Broadcasts',
          description: 'Urgent emergency distress broadcasts from nearby members.',
          importance: Notifications.AndroidImportance.MAX,
          sound: alert,
          vibrationPattern: [0, 800, 400, 800, 400, 800],
          lightColor: '#EF4444',
          showBadge: true,
          bypassDnd: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      } catch {
        // ignore
      }
    }

    await Notifications.setNotificationChannelAsync('chat_v5', {
      name: 'Chat Messages',
      description: 'Direct messages and event group chat messages.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: chime,
      vibrationPattern: [0, 100, 80, 100],
      lightColor: '#D41367',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    // Separate from chat so muting a busy group chat never silences being
    // addressed directly — mentions are the one thing that pierces a mute.
    await Notifications.setNotificationChannelAsync('mentions_v3', {
      name: 'Mentions',
      description: 'When someone @mentions you in a group chat.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: chime,
      vibrationPattern: [0, 150, 100, 150],
      lightColor: '#D41367',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    await Notifications.setNotificationChannelAsync('events_v3', {
      name: 'Event Reminders & Invitations',
      description: 'Reminders before an event starts, invitations, and join approvals.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: chime,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D41367',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync('general_v6', {
      name: 'General',
      description: 'Approvals, verification updates, and other app notifications.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: chime,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D41367',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Organizer broadcasts deliberately do NOT use the chime — an urgent
    // announcement must not sound like an ordinary message.
    await Notifications.setNotificationChannelAsync('organizer_high_v2', {
      name: 'Urgent Organizer Alerts',
      description: 'Highest-urgency announcements from event organizers.',
      importance: Notifications.AndroidImportance.MAX,
      // Deliberately silent: UrgentAlertPlayer loops the sound itself, because an
      // Android channel sound plays once and cannot repeat. A channel sound here
      // would play over the loop.
      sound: null,
      vibrationPattern: [0, 700, 500, 700, 500],
      lightColor: '#D41367',
      showBadge: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync('organizer_alert_v3', {
      name: 'Organizer Announcements',
      description: 'Important announcements from event organizers.',
      importance: Notifications.AndroidImportance.MAX,
      sound: alert,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#D41367',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  // Register interactive native action buttons (matching in-app banner buttons)
  await Notifications.setNotificationCategoryAsync('message_actions', [
    {
      identifier: 'reply',
      buttonTitle: 'REPLY',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: 'dismiss',
      buttonTitle: 'DISMISS',
      options: {
        isDestructive: true,
        opensAppToForeground: false,
      },
    },
  ]);

  await Notifications.setNotificationCategoryAsync('general_actions', [
    {
      identifier: 'view',
      buttonTitle: 'VIEW',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: 'dismiss',
      buttonTitle: 'DISMISS',
      options: {
        isDestructive: true,
        opensAppToForeground: false,
      },
    },
  ]);
}

/**
 * Requests permission (if needed), fetches the Expo push token, and upserts it
 * for the signed-in user. No-op on web and on simulators without push support.
 * Returns the token, or null if push can't be enabled on this device.
 */
export async function registerForPushNotificationsAsync(userId: string, retries = 3): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.warn('[push] Not a physical device — skipping token registration');
    return null;
  }

  console.log('[push] Starting token registration for user:', userId);

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  console.log('[push] Current permission status:', status);
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
    console.log('[push] After request, permission status:', status);
  }
  if (status !== 'granted') {
    console.warn('[push] Permission denied — cannot register push token');
    return null;
  }

  const projectId = resolveProjectId();
  console.log('[push] Resolved projectId:', projectId);
  if (!projectId) {
    console.warn('[push] no EAS projectId — cannot fetch an Expo push token');
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[push] getExpoPushTokenAsync attempt ${attempt}/${retries}`);
    try {
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      currentToken = token;
      console.log('[push] ✅ Got Expo push token:', token.substring(0, 30) + '...');

      // Android additionally registers its RAW FCM token if available
      let deviceToken: string | null = null;
      if (Platform.OS === 'android') {
        try {
          deviceToken = String((await Notifications.getDevicePushTokenAsync()).data);
          console.log('[push] ✅ Got FCM device token:', deviceToken.substring(0, 20) + '...');
        } catch (e) {
          console.warn('[push] getDevicePushTokenAsync failed (non-critical):', e);
        }
      }

      console.log('[push] Upserting token to push_tokens table...');
      const { error } = await supabase.from('push_tokens').upsert(
        {
          token,
          device_token: deviceToken,
          user_id: userId,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      );
      if (error) {
        console.error('[push] ❌ Token upsert FAILED:', error.message, error.code, error.details);
      } else {
        console.log('[push] ✅ Token saved to Supabase successfully!');
      }

      // Clean up stale tokens for this user
      try {
        const { error: delErr } = await supabase
          .from('push_tokens')
          .delete()
          .eq('user_id', userId)
          .eq('platform', Platform.OS)
          .neq('token', token);
        if (delErr) console.warn('[push] Stale token cleanup failed:', delErr.message);
      } catch {
        // ignore
      }

      return token;
    } catch (e) {
      console.warn(`[push] getExpoPushTokenAsync attempt ${attempt}/${retries} failed:`, e);
      if (attempt < retries) {
        const delay = 2500 * attempt;
        console.log(`[push] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error('[push] ❌ All token registration attempts failed. Push notifications will NOT work until the app is reopened.');
  return null;
}

/**
 * Removes THIS device's token so pushes stop (used on opt-out and sign-out). The
 * user's other devices keep their own tokens.
 */
export async function unregisterPushTokenAsync(): Promise<void> {
  if (Platform.OS === 'web') return;
  let token = currentToken;
  if (!token) {
    // Not cached this session (e.g. app relaunched with push already off) — try to
    // resolve it so we can delete precisely, but never prompt for permission.
    try {
      const perm = await Notifications.getPermissionsAsync();
      const projectId = resolveProjectId();
      if (perm.status === 'granted' && projectId && Device.isDevice) {
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      }
    } catch { /* ignore */ }
  }
  if (token) {
    await supabase.from('push_tokens').delete().eq('token', token);
  }
  currentToken = null;
}
