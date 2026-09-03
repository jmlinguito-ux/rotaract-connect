package com.rotaractconnect.app.notifications

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class MuteReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra(NotificationConstants.EXTRA_CONVERSATION_ID)
        val notificationId = intent.getIntExtra(NotificationConstants.EXTRA_NOTIFICATION_ID, 0)

        if (conversationId != null) {
            val prefs = context.getSharedPreferences(NotificationConstants.CONVERSATION_PREFS, Context.MODE_PRIVATE)
            prefs.edit().putBoolean("$conversationId:muted", true).apply()

            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(notificationId)
        }
    }
}
