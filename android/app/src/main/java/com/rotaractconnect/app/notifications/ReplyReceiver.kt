package com.rotaractconnect.app.notifications

import android.app.NotificationManager
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.rotaractconnect.app.notifications.SessionStore.accessToken
import com.rotaractconnect.app.notifications.SessionStore.anonKey
import com.rotaractconnect.app.notifications.SessionStore.currentUserId
import com.rotaractconnect.app.notifications.SessionStore.refreshToken
import com.rotaractconnect.app.notifications.SessionStore.supabaseUrl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Handles Android's inline reply, sending the message straight to Supabase without
 * opening the app.
 *
 * The write is an ordinary authenticated PostgREST insert using the user's own
 * session, so the existing RLS policies decide whether it is allowed — the
 * notification payload is never treated as authority to write anything.
 */
class ReplyReceiver : BroadcastReceiver() {

  companion object {
    const val ACTION = "com.rotaractconnect.app.NOTIFICATION_REPLY"
    const val KEY_TEXT = "key_reply_text"
    const val EXTRA_CONVERSATION_ID = "conversation_id"
    const val EXTRA_RECIPIENT_ID = "recipient_id"
    const val EXTRA_IS_GROUP = "is_group"
    /** Set for the one-tap LIKE action, which sends without opening the input. */
    const val EXTRA_PRESET_TEXT = "preset_text"
    private const val TAG = "RotaractReply"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val text = intent.getStringExtra(EXTRA_PRESET_TEXT)
      ?: RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_TEXT)?.toString()?.trim()
    val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID)
    if (text.isNullOrEmpty() || conversationId.isNullOrEmpty()) return

    val recipientId = intent.getStringExtra(EXTRA_RECIPIENT_ID)
    val isGroup = intent.getBooleanExtra(EXTRA_IS_GROUP, false)
    val userId = context.currentUserId

    // Show the reply in the thread straight away; Android otherwise leaves the
    // notification stuck in its "sending" spinner until something re-posts it.
    val entries = ConversationStore.append(
      context,
      conversationId,
      ConversationStore.Entry(userId ?: "self", "You", text, System.currentTimeMillis(), null)
    )
    NotificationRepublisher.republish(context, conversationId, entries)

    val pending = goAsync()
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val ok = send(context, conversationId, recipientId.takeIf { !isGroup }, text)
        if (!ok) {
          Log.w(TAG, "reply failed to persist for conversation $conversationId")
          NotificationRepublisher.republishWithError(context, conversationId, entries)
        }
      } catch (e: Exception) {
        Log.e(TAG, "reply threw", e)
        NotificationRepublisher.republishWithError(context, conversationId, entries)
      } finally {
        pending.finish()
      }
    }
  }

  private fun send(context: Context, conversationId: String, receiverId: String?, text: String): Boolean {
    val url = context.supabaseUrl ?: return false
    val key = context.anonKey ?: return false
    val sender = context.currentUserId ?: return false
    var token = context.accessToken ?: return false

    val body = JSONArray().put(
      JSONObject()
        .put("conversation_id", conversationId)
        .put("sender_id", sender)
        .put("text", text)
        .apply { if (receiverId != null) put("receiver_id", receiverId) }
    )

    var status = post(url, key, token, body)
    if (status == 401) {
      // Session expired while the app was closed — refresh once and retry.
      token = refresh(context, url, key) ?: return false
      status = post(url, key, token, body)
    }
    return status in 200..299
  }

  private fun post(url: String, key: String, token: String, body: JSONArray): Int =
    (URL("$url/rest/v1/direct_messages").openConnection() as HttpURLConnection).run {
      requestMethod = "POST"
      connectTimeout = 10_000
      readTimeout = 10_000
      doOutput = true
      setRequestProperty("apikey", key)
      setRequestProperty("Authorization", "Bearer $token")
      setRequestProperty("Content-Type", "application/json")
      setRequestProperty("Prefer", "return=minimal")
      outputStream.use { it.write(body.toString().toByteArray()) }
      responseCode
    }

  private fun refresh(context: Context, url: String, key: String): String? = runCatching {
    val refreshToken = context.refreshToken ?: return null
    val conn = (URL("$url/auth/v1/token?grant_type=refresh_token").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 10_000
      readTimeout = 10_000
      doOutput = true
      setRequestProperty("apikey", key)
      setRequestProperty("Content-Type", "application/json")
      outputStream.use { it.write(JSONObject().put("refresh_token", refreshToken).toString().toByteArray()) }
    }
    if (conn.responseCode !in 200..299) return null
    val json = JSONObject(conn.inputStream.use { it.readBytes().decodeToString() })
    val access = json.optString("access_token").ifEmpty { return null }
    val newRefresh = json.optString("refresh_token").ifEmpty { refreshToken }
    SessionStore.updateTokens(context, access, newRefresh)
    access
  }.getOrNull()
}

/** Silences a thread's future notifications and dismisses the current one. */
class MuteReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION = "com.rotaractconnect.app.NOTIFICATION_MUTE"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val conversationId = intent.getStringExtra(ReplyReceiver.EXTRA_CONVERSATION_ID) ?: return
    // Toggle, not one-way: the action reads UNMUTE once muted, so the same button
    // undoes it. Muted threads still arrive (silently), so it stays reachable.
    val muted = ConversationStore.isMuted(context, conversationId)
    ConversationStore.setMuted(context, conversationId, !muted)
    if (!muted) {
      ConversationNotification.cancel(context, conversationId)
    } else {
      NotificationRepublisher.republish(context, conversationId, ConversationStore.messages(context, conversationId))
    }
  }
}

/** Cancels a conversation's notification and forgets its thread. */
class NotificationDismissReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION = "com.rotaractconnect.app.NOTIFICATION_DISMISSED"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val conversationId = intent.getStringExtra(ReplyReceiver.EXTRA_CONVERSATION_ID) ?: return
    ConversationStore.clear(context, conversationId)
    ConversationNotification.cancel(context, conversationId)
  }
}
