package com.rotaractconnect.app.notifications

import org.json.JSONObject

/**
 * The `data` payload of a push, as sent by the send-push Edge Function.
 *
 * Deliberately carries only what is needed to RENDER the notification and to
 * deep-link to the right conversation. Nothing here is treated as authoritative:
 * when the app opens it re-fetches the conversation through Supabase with the
 * user's own session, so RLS still decides what they may see.
 */
data class ChatPayload(
  val conversationId: String,
  val messageId: String?,
  val senderId: String,
  val senderName: String,
  val senderAvatar: String?,
  val conversationName: String?,
  val messagePreview: String,
  val isGroup: Boolean,
  val sentAt: Long,
  /** True when this push exists because the user was @mentioned. */
  val isMention: Boolean,
  /** False for mentions: a muted group must not silence being addressed directly. */
  val respectsMute: Boolean,
  val channelId: String
) {
  /**
   * The notification identity. Mentions get their own so they are never buried in
   * (or replaced by) the ordinary group thread the user may have muted.
   */
  val notificationKey: String get() = if (isMention) "$conversationId:mention" else conversationId

  companion object {
    fun from(data: JSONObject?, fallbackTitle: String?, fallbackText: String?): ChatPayload? {
      if (data == null) return null
      val type = data.optString("type")
      if (type != "chat_message" && type != "mention") return null
      val conversationId = data.optString("conversation_id").ifEmpty { return null }
      val senderName = data.optString("sender_name").ifEmpty { fallbackTitle ?: return null }
      return ChatPayload(
        conversationId = conversationId,
        messageId = data.optString("message_id").ifEmpty { null },
        senderId = data.optString("sender_id").ifEmpty { conversationId },
        senderName = senderName,
        senderAvatar = data.optString("sender_avatar").ifEmpty { null },
        conversationName = data.optString("conversation_name").ifEmpty { null },
        messagePreview = data.optString("message_preview").ifEmpty { fallbackText ?: "" },
        isGroup = data.optBoolean("is_group", false),
        sentAt = parseIso(data.optString("sent_at")),
        isMention = type == "mention",
        // Server-declared, but only ever RELAXES muting for mentions; a payload can
        // never ask to be silenced, so a bad value cannot suppress a notification.
        respectsMute = data.optString("respects_mute") != "false",
        channelId = data.optString("channelId").ifEmpty { "chat_v5" }
      )
    }

    /** Server timestamps are ISO-8601; fall back to now rather than dropping the message. */
    private fun parseIso(value: String?): Long {
      if (value.isNullOrEmpty()) return System.currentTimeMillis()
      return runCatching {
        java.time.Instant.parse(value.replace(" ", "T").let { if (it.endsWith("Z")) it else it + "Z" })
          .toEpochMilli()
      }.getOrElse { System.currentTimeMillis() }
    }
  }
}
