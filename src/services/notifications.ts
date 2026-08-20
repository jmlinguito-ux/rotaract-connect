import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { RotaractEvent, EmergencyAlert } from '../types';

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const CHIME_SOUND = 'chime.wav';
const EMERGENCY_SOUND = 'emergency.wav';

/**
 * Configure Android Notification Channels for fine-grained user control
 * in Android system settings.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // 1. General & Chat channel
    await Notifications.setNotificationChannelAsync('default_v3', {
      name: 'General & Messages',
      description: 'Direct messages, announcements, and system alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: CHIME_SOUND,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D41367',
    });

    // 2. Event Life-Cycle channel (invites, approvals, 1h reminders)
    await Notifications.setNotificationChannelAsync('events_v3', {
      name: 'Events & Invitations',
      description: 'Event invitations, sign-offs, join approvals, and 1-hour start reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: CHIME_SOUND,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D41367',
    });

    // 3. Live Attendance channel
    await Notifications.setNotificationChannelAsync('attendance_v1', {
      name: 'Attendance & Check-In',
      description: 'Instant confirmations when you check in on-site or check out',
      importance: Notifications.AndroidImportance.HIGH,
      sound: CHIME_SOUND,
      vibrationPattern: [0, 150, 150, 150],
      lightColor: '#10B981',
    });

    // 4. Emergency SOS Safety Network channel (urgent alarm)
    await Notifications.deleteNotificationChannelAsync('emergency_sos_v1').catch(() => {});
    await Notifications.deleteNotificationChannelAsync('emergency_sos_v2').catch(() => {});

    await Notifications.setNotificationChannelAsync('emergency_sos_v3', {
      name: 'Emergency SOS Broadcasts',
      description: 'High-priority distress alerts from nearby Rotaractors in need of help',
      importance: Notifications.AndroidImportance.MAX,
      sound: EMERGENCY_SOUND,
      vibrationPattern: [0, 800, 400, 800, 400, 800],
      lightColor: '#EF4444',
      bypassDnd: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (error) {
    console.warn('Failed to set up notification channels:', error);
  }
}

/**
 * Request system push notification permissions and fetch Expo Push Token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice && Platform.OS !== 'web') {
    // Simulators don't receive remote push, but can still receive local notifications
    return null;
  }

  await setupNotificationChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (err) {
    console.warn('Could not obtain push token:', err);
    return null;
  }
}

/**
 * Schedule a local notification 1 hour (60 mins) before an event starts.
 */
export async function scheduleEventReminder(event: RotaractEvent): Promise<string | null> {
  try {
    const startMs = new Date(event.start_datetime).getTime();
    const reminderMs = startMs - 60 * 60 * 1000;
    const nowMs = Date.now();

    // If event is already starting within the hour, don't schedule a past reminder
    if (reminderMs <= nowMs) {
      return null;
    }

    const secondsUntilReminder = Math.max(1, Math.floor((reminderMs - nowMs) / 1000));

    const notificationId = await Notifications.scheduleNotificationAsync({
      identifier: `event_reminder_${event.id}`,
      content: {
        title: `Reminder: ${event.title}`,
        body: `Starts in 1 hour at ${event.address || event.city}. Don't forget your digital event pass!`,
        sound: CHIME_SOUND,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: 'EVENT_REMINDER',
          eventId: event.id,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntilReminder,
        repeats: false,
      },
    });

    return notificationId;
  } catch (err) {
    console.warn('Failed to schedule event reminder:', err);
    return null;
  }
}

/**
 * Cancel scheduled reminder for an event.
 */
export async function cancelEventReminder(eventId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`event_reminder_${eventId}`);
  } catch {
    // Ignore cancellation errors
  }
}

/**
 * Trigger an immediate local notification confirming attendance check-in or check-out.
 */
export async function notifyAttendance(
  type: 'CHECK_IN' | 'CHECK_OUT',
  eventTitle: string,
  distanceMeters?: number
): Promise<void> {
  try {
    const isCheckIn = type === 'CHECK_IN';
    const distText = typeof distanceMeters === 'number' ? ` (${Math.round(distanceMeters)}m from venue)` : '';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: isCheckIn ? '✅ Checked In Successfully' : '👋 Checked Out',
        body: isCheckIn
          ? `You are now checked in to ${eventTitle}${distText}. Have a great service!`
          : `Departure recorded for ${eventTitle}. Your service hours have been logged!`,
        sound: CHIME_SOUND,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: isCheckIn ? 'ATTENDANCE_CHECK_IN' : 'ATTENDANCE_CHECK_OUT',
        },
      },
      trigger: null, // Send immediately
    });
  } catch (err) {
    console.warn('Failed to trigger attendance notification:', err);
  }
}

/**
 * Trigger high-priority emergency SOS notification banner.
 */
export async function notifyEmergencyBroadcast(broadcast: EmergencyAlert): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `sos_${broadcast.id}`,
      content: {
        title: `🚨 EMERGENCY SOS: ${broadcast.full_name}`,
        body: `${broadcast.full_name} (${broadcast.club_name}) triggered a distress signal${broadcast.address_hint ? ` near ${broadcast.address_hint}` : ''}. Tap to view location on map.`,
        sound: EMERGENCY_SOUND,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type: 'EMERGENCY_SOS',
          broadcastId: broadcast.id,
          user_id: broadcast.user_id,
          full_name: broadcast.full_name,
          club_id: broadcast.club_id,
          club_name: broadcast.club_name,
          address_hint: broadcast.address_hint,
          message: broadcast.message,
          avatar_url: broadcast.avatar_url,
          contact_number: broadcast.contact_number,
          latitude: broadcast.latitude,
          longitude: broadcast.longitude,
        },
      },
      trigger: { channelId: 'emergency_sos_v3' } as any, // Immediate with high priority channel
    });
  } catch (err) {
    console.warn('Failed to trigger emergency notification:', err);
  }
}

/**
 * Update app icon badge count.
 */
export async function updateBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Best-effort
  }
}
