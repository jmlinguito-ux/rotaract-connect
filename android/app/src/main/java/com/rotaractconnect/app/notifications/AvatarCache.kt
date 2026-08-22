package com.rotaractconnect.app.notifications

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Avatars for notification Persons.
 *
 * A notification must never be delayed by a slow image: every fetch is bounded by
 * [FETCH_TIMEOUT_MS] and any failure returns null, which the builder renders as a
 * letter-avatar instead. Results are cached in memory and on disk so the same
 * avatar is not re-downloaded for every message in a conversation.
 */
object AvatarCache {
  private const val FETCH_TIMEOUT_MS = 4_000L
  private const val MAX_DIMENSION = 256   // Android downsizes anyway; keep it small.
  private val memory = LruCache<String, Bitmap>(24)

  suspend fun get(context: Context, url: String?): Bitmap? {
    if (url.isNullOrEmpty()) return null
    val key = keyFor(url)
    memory.get(key)?.let { return it }

    val file = File(cacheDir(context), key)
    if (file.exists()) {
      decode(file.readBytes())?.let { memory.put(key, it); return it }
    }

    val bytes = withTimeoutOrNull(FETCH_TIMEOUT_MS) { download(url) } ?: return null
    val bitmap = decode(bytes) ?: return null
    runCatching { file.writeBytes(bytes) }
    memory.put(key, bitmap)
    return bitmap
  }

  private suspend fun download(url: String): ByteArray? = withContext(Dispatchers.IO) {
    runCatching {
      (URL(url).openConnection() as HttpURLConnection).run {
        connectTimeout = FETCH_TIMEOUT_MS.toInt()
        readTimeout = FETCH_TIMEOUT_MS.toInt()
        inputStream.use { it.readBytes() }
      }
    }.getOrNull()
  }

  private fun decode(bytes: ByteArray): Bitmap? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val largest = maxOf(bounds.outWidth, bounds.outHeight)
    val opts = BitmapFactory.Options().apply {
      inSampleSize = if (largest > MAX_DIMENSION) largest / MAX_DIMENSION else 1
    }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
  }.getOrNull()

  private fun cacheDir(context: Context) =
    File(context.cacheDir, "notification-avatars").apply { mkdirs() }

  private fun keyFor(url: String) =
    MessageDigest.getInstance("SHA-256").digest(url.toByteArray())
      .joinToString("") { "%02x".format(it) }
}
