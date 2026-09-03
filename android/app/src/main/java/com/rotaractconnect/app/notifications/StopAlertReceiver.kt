package com.rotaractconnect.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class StopAlertReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d("StopAlertReceiver", "Received stop alert broadcast")
        // If an UrgentAlertPlayer or similar exists, call its stop method here.
    }
}
