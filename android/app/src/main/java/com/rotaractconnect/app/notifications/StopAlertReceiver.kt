package com.rotaractconnect.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Silences a looping urgent alert when its notification is dismissed or tapped.
 * Wired as the notification's delete intent, so a swipe-away stops the sound
 * without the user having to open the app.
 */
class StopAlertReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION = "com.rotaractconnect.app.STOP_URGENT_ALERT"
  }

  override fun onReceive(context: Context, intent: Intent) {
    UrgentAlertPlayer.stop()
  }
}
