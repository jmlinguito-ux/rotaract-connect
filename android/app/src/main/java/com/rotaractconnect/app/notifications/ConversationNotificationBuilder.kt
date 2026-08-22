package com.rotaractconnect.app.notifications

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.notifications.notifications.presentation.builders.ExpoNotificationBuilder
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationCategoriesStore

/**
 * Renders chat pushes as Android conversation notifications.
 *
 * expo-notifications always builds a standard notification with BigTextStyle, which
 * puts any image in the large-icon slot on the RIGHT and leaves the app icon on the
 * left. A messaging app wants MessagingStyle + a Person carrying the sender's avatar
 * + a matching dynamic shortcut; Android then draws the avatar large on the LEFT and
 * groups repeat messages into one conversation.
 *
 * Only pushes carrying `type: "chat_message"` are restyled. Announcements, event
 * reminders and everything else fall through to expo's normal rendering untouched,
 * so they keep looking like ordinary app notifications.
 *
 * super.build() still runs: its content intent and marshalled extras are carried
 * over, and they are what make a tap route back through the JS response listener.
 */
class ConversationNotificationBuilder(
  context: Context,
  notification: expo.modules.notifications.notifications.model.Notification,
  store: SharedPreferencesNotificationCategoriesStore
) : ExpoNotificationBuilder(context, notification, store) {

  private fun withStopIntent(base: Notification): Notification {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return base
    val intent = Intent(context, StopAlertReceiver::class.java).apply { action = StopAlertReceiver.ACTION }
    val pending = PendingIntent.getBroadcast(
      context,
      StopAlertReceiver.ACTION.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return Notification.Builder.recoverBuilder(context, base).setDeleteIntent(pending).build()
  }

  override suspend fun build(): android.app.Notification {
    val base = super.build()
    val content = notification.notificationRequest.content

    // Urgent organizer broadcasts keep sounding until acted on, so they need a
    // delete intent — otherwise swiping the notification away would leave the loop
    // ringing until its timeout.
    val payload = ChatPayload.from(content.body, content.title, content.text)
    if (payload == null) {
      val notification = if (content.body?.optString("type") == "organizer_high") withStopIntent(base) else base
      // Non-chat notifications (Approvals, Cancellations, Verifications, SOS, Announcements)
      // Tint the full banner in Rotaract Cranberry (#D41367)
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val builder = Notification.Builder.recoverBuilder(context, notification)
        builder.setColor(0xFFD41367.toInt())
        builder.setColorized(true)
        builder.build()
      } else {
        notification
      }
    }

    ConversationStore.saveMeta(
      context,
      payload.conversationId,
      ConversationStore.Meta(payload.conversationName, payload.isGroup)
    )

    val entries = ConversationStore.append(
      context,
      payload.conversationId,
      ConversationStore.Entry(
        senderId = payload.senderId,
        senderName = payload.senderName,
        text = payload.messagePreview,
        timestamp = payload.sentAt,
        avatarUrl = payload.senderAvatar
      )
    )

    return ConversationNotification.build(
      context = context,
      conversationId = payload.conversationId,
      conversationName = payload.conversationName,
      isGroup = payload.isGroup,
      entries = entries,
      contentIntent = base.contentIntent,
      extras = base.extras,
      channelId = payload.channelId,
      respectsMute = payload.respectsMute,
      notificationKey = payload.notificationKey
    )
  }
}
