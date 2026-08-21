package com.rotaractconnect.app.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.rotaractconnect.app.R

/**
 * Assembles the Android conversation notification for a chat thread.
 *
 * Shared by the push path (ConversationNotificationBuilder) and the inline-reply
 * path (NotificationRepublisher) so a replied-to thread renders identically to a
 * received one.
 *
 * NotificationCompat throughout, so MessagingStyle degrades sensibly below API 30
 * rather than being skipped; the shortcut + setShortcutId is what promotes it into
 * the Conversations section where the OS supports one.
 */
object ConversationNotification {

  const val CHANNEL_ID = "chat_v5"

  suspend fun build(
    context: Context,
    conversationId: String,
    conversationName: String?,
    isGroup: Boolean,
    entries: List<ConversationStore.Entry>,
    contentIntent: PendingIntent?,
    extras: Bundle?,
    error: Boolean = false,
    channelId: String = CHANNEL_ID,
    /** Mentions pass false so a muted thread cannot silence them. */
    respectsMute: Boolean = true,
    notificationKey: String = conversationId
  ): android.app.Notification {
    val self = Person.Builder().setKey("self").setName("You").build()
    val style = NotificationCompat.MessagingStyle(self)
    style.isGroupConversation = isGroup
    if (isGroup) style.conversationTitle = conversationName

    var latestIcon: IconCompat? = null
    for (entry in entries) {
      val person = if (entry.senderName == "You" && entry.senderId != conversationId) {
        null // null sender means "from me" in MessagingStyle
      } else {
        val icon = AvatarCache.get(context, entry.avatarUrl)?.let { IconCompat.createWithAdaptiveBitmap(it) }
        if (icon != null) latestIcon = icon
        Person.Builder().setKey(entry.senderId).setName(entry.senderName)
          .apply { icon?.let { setIcon(it) } }
          .build()
      }
      style.addMessage(entry.text, entry.timestamp, person)
    }

    publishShortcut(context, conversationId, conversationName ?: entries.lastOrNull()?.senderName ?: "Chat", latestIcon)

    ensureChannel(context, channelId)
    val builder = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(R.drawable.notification_icon)
      .setColor(context.getColor(R.color.notification_color))
      .setStyle(style)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setShortcutId(conversationId)
      .setAutoCancel(true)
      .setWhen(entries.lastOrNull()?.timestamp ?: System.currentTimeMillis())
      .setShowWhen(true)
      .setOnlyAlertOnce(false)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      // LIKE / REPLY / MUTE, in that order. Android renders at most three.
      .addAction(presetAction(context, conversationId, entries, isGroup, "LIKE", "\uD83D\uDC4D"))
      .addAction(replyAction(context, conversationId, entries, isGroup))
      .addAction(muteAction(context, conversationId, ConversationStore.isMuted(context, conversationId)))
      .setDeleteIntent(dismissIntent(context, conversationId))

    // A notification with no contentIntent is inert. The push path supplies expo's
    // intent (which routes to the conversation); the reply-rebuild path has none, so
    // fall back to opening the app rather than leaving the banner dead.
    builder.setContentIntent(contentIntent ?: fallbackContentIntent(context, conversationId))
    // Expo marshals its NotificationRequest into extras; carrying them over is what
    // keeps a tap routing through addNotificationResponseReceivedListener.
    extras?.let { builder.addExtras(it) }
    if (error) builder.setSubText("Not sent — tap to open")
    if (respectsMute && ConversationStore.isMuted(context, conversationId)) {
      // Muted threads still arrive and still update the thread — they just never
      // interrupt: no sound, no vibration, no heads-up.
      builder.setSilent(true)
      builder.priority = NotificationCompat.PRIORITY_LOW
    }

    return builder.build()
  }

  /**
   * Guarantees the channel exists before posting to it.
   *
   * Android silently DROPS a notification posted to an unknown channel on API 26+.
   * The channels are normally created by JS at startup, but that makes delivery
   * depend on the app having launched with a matching bundle — an OTA or a channel
   * rename could otherwise black out notifications with no error anywhere. This is
   * a floor, not a replacement: when JS has already created the channel, Android
   * keeps the existing definition and the user's own overrides untouched.
   */
  private fun ensureChannel(context: Context, channelId: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(channelId) != null) return

    val name = when (channelId) {
      "mentions_v3", "mentions_v2" -> "Mentions"
      "events_v3", "events_v2" -> "Event Reminders & Invitations"
      "general_v6", "general_v5", "general_v4" -> "General"
      "organizer_high_v2" -> "Urgent Organizer Alerts"
      "organizer_alert_v3", "organizer_alert_v2" -> "Organizer Announcements"
      else -> "Chat Messages"
    }
    val importance = if (channelId.startsWith("organizer_")) {
      NotificationManager.IMPORTANCE_MAX
    } else {
      NotificationManager.IMPORTANCE_HIGH
    }
    val channel = NotificationChannel(channelId, name, importance)
    if (channelId.startsWith("organizer_alert")) {
      val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/raw/alert")
      val audioAttributes = AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .build()
      channel.setSound(soundUri, audioAttributes)
    } else if (channelId != "organizer_high_v2") {
      val soundUri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/raw/chime")
      val audioAttributes = AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .build()
      channel.setSound(soundUri, audioAttributes)
    }
    channel.enableVibration(true)
    channel.lightColor = 0xFFD41367.toInt()
    manager.createNotificationChannel(channel)
  }

  fun show(context: Context, notificationKey: String, notification: android.app.Notification) {
    context.getSystemService(NotificationManager::class.java)
      ?.notify(notificationKey, ConversationStore.notificationId(notificationKey), notification)
  }

  /** Must pass the same tag used to post, or the cancel matches nothing. */
  fun cancel(context: Context, notificationKey: String) {
    context.getSystemService(NotificationManager::class.java)
      ?.cancel(notificationKey, ConversationStore.notificationId(notificationKey))
  }

  private fun replyAction(
    context: Context,
    conversationId: String,
    entries: List<ConversationStore.Entry>,
    isGroup: Boolean
  ): NotificationCompat.Action {
    val remoteInput = RemoteInput.Builder(ReplyReceiver.KEY_TEXT).setLabel("Reply").build()
    val intent = Intent(context, ReplyReceiver::class.java).apply {
      action = ReplyReceiver.ACTION
      putExtra(ReplyReceiver.EXTRA_CONVERSATION_ID, conversationId)
      putExtra(ReplyReceiver.EXTRA_IS_GROUP, isGroup)
      // For a 1-on-1 thread the person we reply TO is whoever last wrote to us.
      putExtra(ReplyReceiver.EXTRA_RECIPIENT_ID, entries.lastOrNull { it.senderName != "You" }?.senderId)
    }
    val pending = PendingIntent.getBroadcast(
      context,
      conversationId.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )
    return NotificationCompat.Action.Builder(R.drawable.notification_icon, "Reply", pending)
      .addRemoteInput(remoteInput)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .setShowsUserInterface(false)
      .setAllowGeneratedReplies(true)
      .build()
  }

  private fun fallbackContentIntent(context: Context, conversationId: String): PendingIntent =
    PendingIntent.getActivity(
      context,
      conversationId.hashCode() + 2,
      launchIntent(context),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  /** One-tap send of a fixed message (LIKE), with no input field. */
  private fun presetAction(
    context: Context,
    conversationId: String,
    entries: List<ConversationStore.Entry>,
    isGroup: Boolean,
    label: String,
    text: String
  ): NotificationCompat.Action {
    val intent = Intent(context, ReplyReceiver::class.java).apply {
      action = ReplyReceiver.ACTION
      putExtra(ReplyReceiver.EXTRA_CONVERSATION_ID, conversationId)
      putExtra(ReplyReceiver.EXTRA_IS_GROUP, isGroup)
      putExtra(ReplyReceiver.EXTRA_RECIPIENT_ID, entries.lastOrNull { it.senderName != "You" }?.senderId)
      putExtra(ReplyReceiver.EXTRA_PRESET_TEXT, text)
    }
    val pending = PendingIntent.getBroadcast(
      context,
      conversationId.hashCode() + 3,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Action.Builder(R.drawable.notification_icon, label, pending)
      .setShowsUserInterface(false)
      .build()
  }

  private fun muteAction(context: Context, conversationId: String, muted: Boolean): NotificationCompat.Action {
    val intent = Intent(context, MuteReceiver::class.java).apply {
      action = MuteReceiver.ACTION
      putExtra(ReplyReceiver.EXTRA_CONVERSATION_ID, conversationId)
    }
    val pending = PendingIntent.getBroadcast(
      context,
      conversationId.hashCode() + 4,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Action.Builder(
      R.drawable.notification_icon,
      if (muted) "UNMUTE" else "MUTE",
      pending
    ).setShowsUserInterface(false).build()
  }

  private fun dismissIntent(context: Context, conversationId: String): PendingIntent {
    val intent = Intent(context, NotificationDismissReceiver::class.java).apply {
      action = NotificationDismissReceiver.ACTION
      putExtra(ReplyReceiver.EXTRA_CONVERSATION_ID, conversationId)
    }
    return PendingIntent.getBroadcast(
      context,
      conversationId.hashCode() + 1,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /**
   * Android ignores setShortcutId unless a matching long-lived dynamic shortcut
   * exists — without it the notification never reaches the Conversations section.
   */
  private fun publishShortcut(context: Context, conversationId: String, label: String, icon: IconCompat?) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val person = Person.Builder().setKey(conversationId).setName(label).build()
    val shortcut = ShortcutInfoCompat.Builder(context, conversationId)
      .setShortLabel(label)
      .setLongLived(true)
      .setPerson(person)
      .setIntent(launchIntent(context))
      .apply { icon?.let { setIcon(it) } }
      .build()
    runCatching { ShortcutManagerCompat.pushDynamicShortcut(context, shortcut) }
  }

  private fun launchIntent(context: Context): Intent =
    context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.setAction(Intent.ACTION_VIEW)
      ?: Intent(Intent.ACTION_MAIN)
}

/** Re-posts a conversation's notification after an inline reply changes the thread. */
object NotificationRepublisher {
  fun republish(context: Context, conversationId: String, entries: List<ConversationStore.Entry>) =
    repost(context, conversationId, entries, false)

  fun republishWithError(context: Context, conversationId: String, entries: List<ConversationStore.Entry>) =
    repost(context, conversationId, entries, true)

  private fun repost(context: Context, conversationId: String, entries: List<ConversationStore.Entry>, error: Boolean) {
    val meta = ConversationStore.meta(context, conversationId)
    kotlinx.coroutines.runBlocking {
      val notification = ConversationNotification.build(
        context = context,
        conversationId = conversationId,
        conversationName = meta.name,
        isGroup = meta.isGroup,
        entries = entries,
        contentIntent = null,   // build() falls back to launching the app
        extras = null,
        error = error
      )
      ConversationNotification.show(context, conversationId, notification)
    }
  }
}
