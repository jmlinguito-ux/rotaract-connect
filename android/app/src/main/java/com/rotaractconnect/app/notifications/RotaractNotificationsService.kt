package com.rotaractconnect.app.notifications

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationCategoriesStore
import expo.modules.notifications.service.interfaces.PresentationDelegate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Swaps in ConversationNotificationBuilder, and gives chat notifications a stable
 * per-conversation id so three messages from one thread update ONE notification
 * instead of stacking three. expo's default id is per-request, which is exactly the
 * notification-spam behaviour we want to avoid.
 *
 * expo-notifications declares its own NotificationsService receiver at
 * android:priority="-1" specifically so an app can supersede it; our manifest entry
 * registers this subclass at the default priority, which wins.
 */
class RotaractPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {

  override suspend fun createNotification(
    notification: Notification,
    notificationBehavior: NotificationBehaviorRecord?
  ): android.app.Notification =
    ConversationNotificationBuilder(
      context,
      notification,
      SharedPreferencesNotificationCategoriesStore(context)
    ).apply { setAllowedBehavior(notificationBehavior) }.build()

  /**
   * Posts chat notifications under a per-CONVERSATION tag.
   *
   * A stable notify id alone is not enough: expo posts with
   * `notify(notificationRequest.identifier, id, …)`, and that identifier is unique
   * per push. Android keys a notification on the (tag, id) PAIR, so a fresh tag
   * created a brand-new notification for every message no matter what id we chose —
   * which is exactly the "three separate entries" behaviour. Pinning both halves to
   * the conversation is what makes messages collapse into one thread.
   */
  override fun presentNotification(notification: Notification, behavior: NotificationBehaviorRecord?) {
    val content = notification.notificationRequest.content

    // Urgent broadcasts sound until dismissed. Started here rather than in the
    // builder so it begins exactly when the notification becomes visible.
    if (content.body?.optString("type") == "organizer_high") {
      UrgentAlertPlayer.start(context)
    }

    val payload = ChatPayload.from(content.body, content.title, content.text)
    if (payload == null) {
      CoroutineScope(Dispatchers.IO).launch {
        val built = createNotification(notification, behavior)
        val tag = notification.notificationRequest.identifier
        NotificationManagerCompat.from(context)
          .notify(tag, getNotifyId(notification.notificationRequest), built)
      }
      return
    }
    // Don't interrupt someone about the conversation they already have open.
    if (ConversationStore.isActive(context, payload.conversationId)) return
    CoroutineScope(Dispatchers.IO).launch {
      val built = createNotification(notification, behavior)
      // Mentions carry their own key, so one never replaces the group thread.
      NotificationManagerCompat.from(context)
        .notify(payload.notificationKey, ConversationStore.notificationId(payload.notificationKey), built)
    }
  }

  private fun chatNotificationKey(request: NotificationRequest?): String? {
    val content = request?.content ?: return null
    return ChatPayload.from(content.body, content.title, content.text)?.notificationKey
  }

  override fun getNotifyId(request: NotificationRequest?): Int {
    return chatNotificationKey(request)?.let { ConversationStore.notificationId(it) }
      ?: super.getNotifyId(request)
  }
}

class RotaractNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    RotaractPresentationDelegate(context)
}
