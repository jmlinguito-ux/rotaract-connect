package com.rotaractconnect.notifications

import android.app.NotificationManager
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Bridges the pieces of notification state that must be readable by native code
 * while the app is NOT running.
 *
 * `setSession` mirrors the Supabase session into app-private SharedPreferences so
 * the inline-reply BroadcastReceiver can post a message from a dead process. The
 * reply is then an ordinary authenticated PostgREST call — RLS still applies. The
 * token never leaves the device and is never put in a push payload.
 *
 * Writes the same SharedPreferences file the app module's SessionStore reads. The
 * key names are duplicated here on purpose: a local Expo module is a separate
 * Gradle project and cannot depend on :app without a dependency cycle.
 */
class RotaractNotificationsModule : Module() {

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context unavailable" }

  override fun definition() = ModuleDefinition {
    Name("RotaractNotifications")

    Function("setSession") { url: String, anonKey: String, accessToken: String, refreshToken: String, userId: String ->
      context.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE).edit()
        .putString("url", url)
        .putString("anonKey", anonKey)
        .putString("accessToken", accessToken)
        .putString("refreshToken", refreshToken)
        .putString("userId", userId)
        .apply()
    }

    Function("clearSession") {
      context.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    /**
     * Silences a looping urgent-broadcast alert (tap, or app brought to foreground).
     *
     * Sent as a broadcast rather than calling UrgentAlertPlayer directly: a local
     * Expo module is its own Gradle project and cannot depend on :app without a
     * dependency cycle. Package-scoped so it stays an explicit broadcast.
     */
    Function("stopUrgentAlert") {
      context.sendBroadcast(
        android.content.Intent(STOP_ALERT_ACTION).setPackage(context.packageName)
      )
    }

    /**
     * Marks the conversation currently on screen, so incoming messages for it are
     * not turned into notifications. Pass null when leaving the chat.
     */
    Function("setActiveConversation") { conversationId: String? ->
      context.getSharedPreferences(CONVERSATION_PREFS, Context.MODE_PRIVATE).edit().apply {
        if (conversationId == null) remove(ACTIVE_KEY) else putString(ACTIVE_KEY, conversationId)
      }.apply()
    }

    /** Mirrors the notification's MUTE / UNMUTE toggle, so the app can undo it too. */
    Function("setConversationMuted") { conversationId: String, muted: Boolean ->
      context.getSharedPreferences(CONVERSATION_PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean("$conversationId:muted", muted).apply()
    }

    Function("isConversationMuted") { conversationId: String ->
      context.getSharedPreferences(CONVERSATION_PREFS, Context.MODE_PRIVATE)
        .getBoolean("$conversationId:muted", false)
    }

    /**
     * Called when a conversation is opened or read: drops its accumulated thread and
     * cancels its notification, so reopening the app does not leave a stale banner.
     */
    Function("clearConversation") { conversationId: String ->
      context.getSharedPreferences(CONVERSATION_PREFS, Context.MODE_PRIVATE).edit()
        .remove(conversationId).apply()
      context.getSystemService(NotificationManager::class.java)?.cancel(conversationId.hashCode())
    }
  }

  private companion object {
    const val SESSION_PREFS = "rotaract_session"
    const val CONVERSATION_PREFS = "rotaract_conversation_notifications"
    const val ACTIVE_KEY = "__active_conversation"
    const val STOP_ALERT_ACTION = "com.rotaractconnect.app.STOP_URGENT_ALERT"
  }
}
