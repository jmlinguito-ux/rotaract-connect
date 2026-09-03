const { withAndroidManifest } = require('expo/config-plugins');

const PKG = 'com.rotaractconnect.app.notifications';
const RECEIVER = `${PKG}.RotaractNotificationsService`;

// The notification-action receivers. Registered here too so `expo prebuild --clean`
// cannot silently drop the Reply / Mute / dismiss handling and leave the action
// buttons inert.
const ACTION_RECEIVERS = [
  [`${PKG}.ReplyReceiver`, 'com.rotaractconnect.app.NOTIFICATION_REPLY'],
  [`${PKG}.MuteReceiver`, 'com.rotaractconnect.app.NOTIFICATION_MUTE'],
  [`${PKG}.NotificationDismissReceiver`, 'com.rotaractconnect.app.NOTIFICATION_DISMISSED'],
  [`${PKG}.StopAlertReceiver`, 'com.rotaractconnect.app.STOP_URGENT_ALERT'],
];

/**
 * Registers RotaractNotificationsService so chat pushes render as Android
 * conversation notifications (avatar on the left) instead of the standard layout.
 *
 * expo-notifications declares its own NotificationsService receiver with
 * android:priority="-1" specifically so an app can supersede it. Declaring our
 * subclass at the default priority (0) makes it the one that handles the
 * NOTIFICATION_EVENT broadcast, and its presentation delegate swaps in
 * ConversationNotificationBuilder.
 *
 * Applied as a config plugin so the entry survives `expo prebuild --clean`. The
 * Kotlin itself lives in android/app/src/main/java/... which is committed.
 */
module.exports = function withConversationNotifications(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    app.receiver = app.receiver ?? [];

    for (const [name, action] of ACTION_RECEIVERS) {
      if (app.receiver.some((r) => r.$?.['android:name'] === name)) continue;
      app.receiver.push({
        $: { 'android:name': name, 'android:enabled': 'true', 'android:exported': 'false' },
        'intent-filter': [{ action: [{ $: { 'android:name': action } }] }],
      });
    }

    if (app.receiver.some((r) => r.$?.['android:name'] === RECEIVER)) return cfg;

    app.receiver.push({
      $: {
        'android:name': RECEIVER,
        'android:enabled': 'true',
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'expo.modules.notifications.NOTIFICATION_EVENT' } },
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.REBOOT' } },
            { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
            { $: { 'android:name': 'com.htc.intent.action.QUICKBOOT_POWERON' } },
            { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
          ],
        },
      ],
    });
    return cfg;
  });
};
