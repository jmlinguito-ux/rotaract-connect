package com.rotaractconnect.app.notifications

import android.content.Context
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationCategoriesStore

class RotaractPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
    override suspend fun createNotification(
        notification: Notification,
        notificationBehavior: NotificationBehaviorRecord?,
    ): android.app.Notification {
        return ConversationNotificationBuilder(context, notification, SharedPreferencesNotificationCategoriesStore(context)).apply {
            setAllowedBehavior(notificationBehavior)
        }.build()
    }
}
