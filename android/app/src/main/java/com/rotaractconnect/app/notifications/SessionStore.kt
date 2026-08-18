package com.rotaractconnect.app.notifications

import android.content.Context

/**
 * The signed-in user's Supabase session, mirrored from JS so the inline-reply
 * receiver can post a message while the app is not running.
 *
 * Stored in app-private SharedPreferences: readable only by this app on a
 * non-rooted device. Nothing here ever travels in a push payload — the token is
 * written locally by the app itself (see modules/rotaract-notifications), and the
 * reply is an ordinary authenticated PostgREST call, so RLS still applies exactly
 * as it does in-app.
 */
object SessionStore {
  private const val PREFS = "rotaract_session"

  fun save(context: Context, url: String, anonKey: String, accessToken: String, refreshToken: String, userId: String) {
    prefs(context).edit()
      .putString("url", url)
      .putString("anonKey", anonKey)
      .putString("accessToken", accessToken)
      .putString("refreshToken", refreshToken)
      .putString("userId", userId)
      .apply()
  }

  fun clear(context: Context) = prefs(context).edit().clear().apply()

  val Context.supabaseUrl: String? get() = prefs(this).getString("url", null)
  val Context.anonKey: String? get() = prefs(this).getString("anonKey", null)
  val Context.accessToken: String? get() = prefs(this).getString("accessToken", null)
  val Context.refreshToken: String? get() = prefs(this).getString("refreshToken", null)
  val Context.currentUserId: String? get() = prefs(this).getString("userId", null)

  fun updateTokens(context: Context, accessToken: String, refreshToken: String) {
    prefs(context).edit().putString("accessToken", accessToken).putString("refreshToken", refreshToken).apply()
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
