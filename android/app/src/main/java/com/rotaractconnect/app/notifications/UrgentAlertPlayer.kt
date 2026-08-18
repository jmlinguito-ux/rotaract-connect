package com.rotaractconnect.app.notifications

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Loops the urgent-broadcast sound until the notification is acted on.
 *
 * Android channel sounds play exactly ONCE — there is no "repeat until dismissed"
 * setting anywhere in the notification API. The only way to get a sustained alert
 * is for the app to play the audio itself, which is possible here because urgent
 * broadcasts arrive as data messages and those wake the process even when the app
 * is closed. The organizer_high channel is therefore deliberately SILENT: if it
 * also carried a sound, every alert would play twice over itself.
 *
 * Stopped by: dismissing the notification (delete intent), tapping it, the app
 * coming to the foreground, or the hard timeout below — a notification that can
 * ring forever is a bug, not a feature.
 */
object UrgentAlertPlayer {

  /**
   * Base name of the file in res/raw, bundled via the expo-notifications `sounds`
   * array in app.json. Change BOTH together — dropping assets/sounds/alert.mp3 in
   * and setting this to "alert" is the whole swap.
   */
  private const val SOUND_RES_NAME = "alert"

  /** No alert may outlive this, however it was dismissed. */
  private const val MAX_DURATION_MS = 60_000L

  private var player: MediaPlayer? = null
  private val handler = Handler(Looper.getMainLooper())
  private val stopRunnable = Runnable { stop() }

  @Synchronized
  fun start(context: Context) {
    stop() // never stack two alerts

    val resId = context.resources.getIdentifier(SOUND_RES_NAME, "raw", context.packageName)
    if (resId == 0) {
      Log.w("RotaractAlert", "res/raw/$SOUND_RES_NAME missing — rebuild after adding it to the sounds array")
      return
    }

    try {
      player = MediaPlayer.create(context.applicationContext, resId)?.apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            // ALARM usage so it is audible over silent/DND, which is the entire
            // point of an urgent organizer broadcast.
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        isLooping = true
        start()
      }
      handler.removeCallbacks(stopRunnable)
      handler.postDelayed(stopRunnable, MAX_DURATION_MS)
    } catch (e: Exception) {
      Log.e("RotaractAlert", "could not start urgent alert", e)
      player = null
    }
  }

  @Synchronized
  fun stop() {
    handler.removeCallbacks(stopRunnable)
    player?.let {
      runCatching { if (it.isPlaying) it.stop() }
      runCatching { it.release() }
    }
    player = null
  }
}
