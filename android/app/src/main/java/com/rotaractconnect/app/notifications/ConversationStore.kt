package com.rotaractconnect.app.notifications

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * The recent messages of each conversation, so MessagingStyle can show a thread
 * ("Juan: Hey / Juan: Are you there?") instead of three unrelated notifications.
 *
 * Persisted rather than kept in memory because a push may wake a brand-new process:
 * without this, the second message of a conversation would have no history to
 * append to and would render as a lone message again.
 */
object ConversationStore {
  private const val PREFS = "rotaract_conversation_notifications"
  // Android renders at most ~7 messages in an expanded MessagingStyle; keeping
  // more would just be dropped by System UI.
  private const val MAX_MESSAGES = 7
  private const val ACTIVE_KEY = "__active_conversation"
  private const val ACTIVE_AT_KEY = "__active_conversation_at"
  private const val ACTIVE_TTL_MS = 2 * 60 * 1000L

  data class Entry(val senderId: String, val senderName: String, val text: String, val timestamp: Long, val avatarUrl: String?)

  /** Conversation title + group flag, so a reply-triggered rebuild keeps them. */
  data class Meta(val name: String?, val isGroup: Boolean)

  fun saveMeta(context: Context, conversationId: String, meta: Meta) {
    prefs(context).edit()
      .putString("$conversationId:name", meta.name ?: "")
      .putBoolean("$conversationId:group", meta.isGroup)
      .apply()
  }

  fun meta(context: Context, conversationId: String): Meta = Meta(
    prefs(context).getString("$conversationId:name", null)?.ifEmpty { null },
    prefs(context).getBoolean("$conversationId:group", false)
  )

  fun append(context: Context, conversationId: String, entry: Entry): List<Entry> {
    val existing = messages(context, conversationId).toMutableList()
    existing.add(entry)
    while (existing.size > MAX_MESSAGES) existing.removeAt(0)
    save(context, conversationId, existing)
    return existing
  }

  fun messages(context: Context, conversationId: String): List<Entry> {
    val raw = prefs(context).getString(conversationId, null) ?: return emptyList()
    return runCatching {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        Entry(
          senderId = o.optString("senderId"),
          senderName = o.optString("senderName"),
          text = o.optString("text"),
          timestamp = o.optLong("timestamp"),
          avatarUrl = o.optString("avatarUrl").ifEmpty { null }
        )
      }
    }.getOrElse { emptyList() }
  }

  /** Called when the conversation is opened or its notification dismissed. */
  fun clear(context: Context, conversationId: String) {
    prefs(context).edit()
      .remove(conversationId)
      .remove("$conversationId:name")
      .remove("$conversationId:group")
      .apply()   // the mute flag deliberately survives: reading a thread is not unmuting it
  }

  private fun save(context: Context, conversationId: String, entries: List<Entry>) {
    val arr = JSONArray()
    entries.forEach {
      arr.put(
        JSONObject()
          .put("senderId", it.senderId)
          .put("senderName", it.senderName)
          .put("text", it.text)
          .put("timestamp", it.timestamp)
          .put("avatarUrl", it.avatarUrl ?: "")
      )
    }
    prefs(context).edit().putString(conversationId, arr.toString()).apply()
  }

  /**
   * The conversation currently on screen, if any. Written by the app (see
   * modules/rotaract-notifications) so the native presenter can skip notifying
   * someone about the very thread they are reading.
   *
   * Deliberately native rather than read from the JS notification behaviour:
   * NotificationBehaviorRecord's KSP-generated supertype is not reachable from the
   * app module, and this also keeps working in states where JS never runs.
   */
  fun setActive(context: Context, conversationId: String?) {
    prefs(context).edit().apply {
      if (conversationId == null) {
        remove(ACTIVE_KEY)
        remove(ACTIVE_AT_KEY)
      } else {
        putString(ACTIVE_KEY, conversationId)
        putLong(ACTIVE_AT_KEY, System.currentTimeMillis())
      }
    }.apply()
  }

  /**
   * Whether this conversation is on screen right now.
   *
   * Time-boxed on purpose. The flag is cleared when the chat closes or the app
   * backgrounds, but a force-close runs neither — and a stale flag would silently
   * suppress every notification for that conversation forever, which is far worse
   * than briefly notifying someone about a chat they are looking at. The app
   * re-asserts the flag while the screen stays open, so a genuine long read is
   * refreshed well inside this window.
   */
  fun isActive(context: Context, conversationId: String): Boolean {
    val p = prefs(context)
    if (p.getString(ACTIVE_KEY, null) != conversationId) return false
    val since = System.currentTimeMillis() - p.getLong(ACTIVE_AT_KEY, 0L)
    if (since > ACTIVE_TTL_MS) {
      setActive(context, null)   // stale — drop it so it cannot linger
      return false
    }
    return true
  }

  /** Muted threads still deliver, but silently — matching how Messenger's mute behaves. */
  fun setMuted(context: Context, conversationId: String, muted: Boolean) {
    prefs(context).edit().putBoolean("$conversationId:muted", muted).apply()
  }

  fun isMuted(context: Context, conversationId: String): Boolean =
    prefs(context).getBoolean("$conversationId:muted", false)

  /** A stable notification id per conversation, so messages update one notification. */
  fun notificationId(conversationId: String): Int = conversationId.hashCode()

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
