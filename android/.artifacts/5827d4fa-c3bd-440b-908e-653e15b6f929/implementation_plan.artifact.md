# Fix Chime Sound Not Playing

The issue of `chime.wav` not playing when the app is open is likely due to two factors:
1. **Incorrect Sound Reference on Android**: Notification channels and local notifications are referencing `chime.wav` with the extension. On Android, resources in `res/raw` should be referenced by their name only (e.g., `chime`). The logs confirm that `expo-notifications` is failing to find `chime.wav`.
2. **Silenced Foreground Notifications**: The app is configured to suppress notification sounds when in the foreground (`shouldPlaySound: false`), intending for manual sound playback via Supabase Realtime. However, the Realtime channels are currently failing with `CHANNEL_ERROR`, meaning the manual playback never triggers.

## Proposed Changes

### [Component] Notification Configuration

#### [MODIFY] [notifications.ts](file:///Users/jonahmicahinguito/dev/rotaract-connect/src/services/notifications.ts)
- Change `CHIME_SOUND` to `'chime'` (removing `.wav`).
- Update `notifyChatMessage` and `notifyAppNotification` to use sound names without extensions on Android.
- **Optional**: Enable `shouldPlaySound: true` in `setNotificationHandler` as a fallback if Realtime continues to fail, or keep it `false` but ensure the manual playback is working. Given the Realtime errors, enabling it in the handler might be a safer immediate fix for "missing sound".

#### [MODIFY] [push.ts](file:///Users/jonahmicahinguito/dev/rotaract-connect/src/services/push.ts)
- Update Android channel configuration to use sound names without extensions (e.g., `chime`, `alert`, `emergency`).

### [Component] Realtime Sync (Investigation/Fix)

#### [MODIFY] [useRealtimeSync.ts](file:///Users/jonahmicahinguito/dev/rotaract-connect/src/context/useRealtimeSync.ts)
- Investigate why `CHANNEL_ERROR` is occurring. Common causes include missing tables in the `supabase_realtime` publication or authentication issues.
- *Note: I will first fix the sound references, then check if Realtime can be fixed or if we should fallback to OS sounds in the foreground.*

## Verification Plan

### Automated Tests
- None (UI/Native sound behavior is hard to test automatically in this environment).

### Manual Verification
1. Deploy the app to an Android device.
2. Send a message to the device while the app is open.
3. Verify if the chime sounds.
4. Check the Metro console for "Custom sound not found" errors.
5. Check if `[realtime]` errors persist.
