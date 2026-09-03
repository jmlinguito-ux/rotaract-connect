package com.rotaractconnect.app.notifications

object NotificationConstants {
    const val SESSION_PREFS = "rotaract_session"
    const val CONVERSATION_PREFS = "rotaract_conversation_notifications"
    const val ACTIVE_KEY = "__active_conversation"
    const val STOP_ALERT_ACTION = "com.rotaractconnect.app.STOP_URGENT_ALERT"

    // Action strings for intents
    const val REPLY_ACTION = "com.rotaractconnect.app.REPLY_ACTION"
    const val MUTE_ACTION = "com.rotaractconnect.app.MUTE_ACTION"
    const val DISMISS_ACTION = "com.rotaractconnect.app.DISMISS_ACTION"

    // Extra keys
    const val EXTRA_CONVERSATION_ID = "conversation_id"
    const val EXTRA_MESSAGE_ID = "message_id"
    const val EXTRA_SENDER_ID = "sender_id"
    const val EXTRA_SENDER_NAME = "sender_name"
    const val EXTRA_NOTIFICATION_ID = "notification_id"
}
