package com.rotaractconnect.app.notifications

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val remoteInput = RemoteInput.getResultsFromIntent(intent)
        val replyText = remoteInput?.getCharSequence("result_receive_message")?.toString()
        val conversationId = intent.getStringExtra(NotificationConstants.EXTRA_CONVERSATION_ID)
        val notificationId = intent.getIntExtra(NotificationConstants.EXTRA_NOTIFICATION_ID, 0)

        if (replyText != null && conversationId != null) {
            val prefs = context.getSharedPreferences(NotificationConstants.SESSION_PREFS, Context.MODE_PRIVATE)
            val url = prefs.getString("url", null)
            val anonKey = prefs.getString("anonKey", null)
            val accessToken = prefs.getString("accessToken", null)
            val userId = prefs.getString("userId", null)

            if (url != null && anonKey != null && accessToken != null && userId != null) {
                val pendingResult = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val endpoint = URL("$url/rest/v1/messages")
                        val conn = endpoint.openConnection() as HttpURLConnection
                        conn.requestMethod = "POST"
                        conn.setRequestProperty("apikey", anonKey)
                        conn.setRequestProperty("Authorization", "Bearer $accessToken")
                        conn.setRequestProperty("Content-Type", "application/json")
                        conn.setRequestProperty("Prefer", "return=minimal")
                        conn.doOutput = true

                        val body = JSONObject().apply {
                            put("conversation_id", conversationId)
                            put("content", replyText)
                            put("sender_id", userId)
                        }

                        conn.outputStream.use { os ->
                            os.write(body.toString().toByteArray())
                        }

                        if (conn.responseCode in 200..299) {
                            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                            notificationManager.cancel(notificationId)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    } finally {
                        pendingResult.finish()
                    }
                }
            }
        }
    }
}
