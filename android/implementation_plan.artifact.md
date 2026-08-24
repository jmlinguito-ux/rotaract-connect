# Implementation Plan: Fix Android Push Notifications when App is Closed

This plan addresses the issue where Android push notifications are not received or not correctly rendered as "Conversations" when the app is closed. The root cause is that the Supabase Edge Function currently only sends notifications via the Expo Push Service, which uses a format that Android OS often handles genericly in the background, bypassing the custom native logic designed for this app.

## User Review Required

> [!IMPORTANT]
> This change requires setting a new Secret in your Supabase project: `FCM_SERVICE_ACCOUNT`. You will need to download the Service Account JSON from your Firebase Console (Project Settings -> Service Accounts) and set it using the Supabase CLI:
> `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat your-service-account.json)"`

## Proposed Changes

### Supabase Edge Function

#### [MODIFY] [send-push/index.ts](file:///Users/jonahmicahinguito/dev/rotaract-connect/supabase/functions/send-push/index.ts)
- **Implement FCM/Expo logic separation**: Update the `deliver` function to identify Android devices that have a `device_token` (FCM token) and route them through the `sendViaFcm` path.
- **Enable FCM Delivery**: Call the existing (but currently unused) `sendViaFcm` function.
- **Data-only FCM messages**: Modify `sendViaFcm` to remove the `notification` block. This ensures the message is treated as "Data" by Android, which wakes up the app's native `RotaractNotificationsService` to build the rich Conversation UI even when the app is killed.
- **Deduplication**: Ensure that if a device has both an Expo token and an FCM token, we prioritize FCM for Android to avoid duplicate notifications.

---

### Android Native Configuration

#### [MODIFY] [AndroidManifest.xml](file:///Users/jonahmicahinguito/dev/rotaract-connect/android/app/src/main/AndroidManifest.xml)
- **Add POST_NOTIFICATIONS permission**: Explicitly declare `android.permission.POST_NOTIFICATIONS` for Android 13+ support. While libraries might include it, having it in the main manifest is best practice for visibility and ensures it's not stripped.

---

## Verification Plan

### Automated Tests
- I will check the Supabase Edge Function syntax using a basic script (if possible) or ensure it compiles correctly according to Deno standards.

### Manual Verification
- **Test Push Notification**: After deploying the updated function and setting the secret, send a test message from one account to another while the recipient app is force-closed.
- **Verify UI**: The notification should appear as a "Conversation" (with sender avatar and inline reply support) rather than a generic Expo notification.
- **Check Logs**: Monitor Supabase Edge Function logs for `[send-push] ... → sent X, pruned Y` messages to confirm the FCM path is being taken.
