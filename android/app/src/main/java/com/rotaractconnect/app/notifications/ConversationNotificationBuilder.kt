package com.rotaractconnect.app.notifications

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.presentation.builders.ExpoNotificationBuilder
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationCategoriesStore

class ConversationNotificationBuilder(
    context: Context,
    notification: Notification,
    store: SharedPreferencesNotificationCategoriesStore
) : ExpoNotificationBuilder(context, notification, store) {

    override suspend fun build(): android.app.Notification {
        val expoNotification = super.build()
        val content = notification.notificationRequest.content
        val data = content.body
        
        if (data == null || !data.has("conversation_id")) {
            return expoNotification
        }

        val conversationId = data.getString("conversation_id")
        val senderId = data.optString("sender_id")
        val senderName = data.optString("sender_name", "Someone")
        val messageText = data.optString("message_preview") ?: content.text ?: ""
        val notificationId = conversationId.hashCode()

        // Use the notification already built by Expo as a base to preserve sounds, channels, etc.
        val builder = NotificationCompat.Builder(context, expoNotification)

        val user = Person.Builder().setName("Me").build()
        val sender = Person.Builder().setName(senderName).setKey(senderId).build()
        
        val style = NotificationCompat.MessagingStyle(user)
            .setConversationTitle(content.title)
            .addMessage(messageText, System.currentTimeMillis(), sender)
            .setGroupConversation(false)

        builder.setStyle(style)
        builder.setShortcutId(conversationId)
        
        addConversationActions(builder, conversationId, senderId, senderName, notificationId)

        return builder.build()
    }

    private fun addConversationActions(
        builder: NotificationCompat.Builder,
        conversationId: String,
        senderId: String,
        senderName: String,
        notificationId: Int
    ) {
        val remoteInput = RemoteInput.Builder("result_receive_message")
            .setLabel("Reply...")
            .build()

        val replyIntent = Intent(context, ReplyReceiver::class.java).apply {
            action = NotificationConstants.REPLY_ACTION
            putExtra(NotificationConstants.EXTRA_CONVERSATION_ID, conversationId)
            putExtra(NotificationConstants.EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(NotificationConstants.EXTRA_SENDER_ID, senderId)
            putExtra(NotificationConstants.EXTRA_SENDER_NAME, senderName)
        }
        val replyPendingIntent = PendingIntent.getBroadcast(
            context,
            conversationId.hashCode(),
            replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )

        val replyAction = NotificationCompat.Action.Builder(
            android.R.drawable.ic_menu_send,
            "Reply",
            replyPendingIntent
        ).addRemoteInput(remoteInput).build()

        val muteIntent = Intent(context, MuteReceiver::class.java).apply {
            action = NotificationConstants.MUTE_ACTION
            putExtra(NotificationConstants.EXTRA_CONVERSATION_ID, conversationId)
            putExtra(NotificationConstants.EXTRA_NOTIFICATION_ID, notificationId)
        }
        val mutePendingIntent = PendingIntent.getBroadcast(
            context,
            conversationId.hashCode() + 1,
            muteIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val muteAction = NotificationCompat.Action.Builder(
            android.R.drawable.ic_lock_silent_mode,
            "Mute",
            mutePendingIntent
        ).build()

        builder.addAction(replyAction)
        builder.addAction(muteAction)
        
        val dismissIntent = Intent(context, NotificationDismissReceiver::class.java).apply {
            action = NotificationConstants.DISMISS_ACTION
            putExtra(NotificationConstants.EXTRA_CONVERSATION_ID, conversationId)
        }
        val dismissPendingIntent = PendingIntent.getBroadcast(
            context,
            conversationId.hashCode() + 2,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        builder.setDeleteIntent(dismissPendingIntent)
    }
}
