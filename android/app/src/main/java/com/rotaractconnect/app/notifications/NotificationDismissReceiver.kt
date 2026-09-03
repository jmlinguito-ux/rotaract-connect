package com.rotaractconnect.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NotificationDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val conversationId = intent.getStringExtra(NotificationConstants.EXTRA_CONVERSATION_ID)
        if (conversationId != null) {
            val prefs = context.getSharedPreferences(NotificationConstants.CONVERSATION_PREFS, Context.MODE_PRIVATE)
            prefs.edit().remove(conversationId).apply()
        }
    }
}
