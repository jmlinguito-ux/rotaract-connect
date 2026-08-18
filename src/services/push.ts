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

/**
 * Sets the foreground presentation policy and Android channels. In the foreground
 * the in-app banner already handles the alert, so we suppress the OS banner/sound
 * to avoid a double notification; background/terminated pushes are shown by the OS
 * directly (this handler isn't consulted then). Call once at startup.
 */
export async function configurePushNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync('high', {
      name: 'Important Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

/**
 * Requests permission (if needed), fetches the Expo push token, and upserts it
 * for the signed-in user. No-op on web and on simulators without push support.
 * Returns the token, or null if push can't be enabled on this device.
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null; // push tokens require a physical device

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null; // respect the device-level permission

  const projectId = resolveProjectId();
  if (!projectId) {
    console.warn('[push] no EAS projectId — cannot fetch an Expo push token');
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = token;
    const { error } = await supabase.from('push_tokens').upsert(
      { token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    if (error) console.warn('[push] token upsert failed', error.message);
    return token;
  } catch (e) {
    console.warn('[push] getExpoPushTokenAsync failed', e);
    return null;
  }
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
