package io.freetubeapp.freetube

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import java.net.URL
import java.util.UUID
class FreeTubeJavaScriptInterface {
  private var context: MainActivity
  private var mediaSessions: MutableMap<String, MediaSession>
  companion object {
    private const val CHANNEL_ID = "media_controls"
    private const val NOTIFICATION_ID = 1
  }
  constructor(main: MainActivity) {
    context = main
    mediaSessions = HashMap<String, MediaSession>()
  }
  @JavascriptInterface
  fun createToast(text: String) {
    Toast.makeText(context, text, Toast.LENGTH_LONG).show()
  }
  private fun setState(session: MediaSession, state: Int, position: Long = 0) {
    var pausePlayIcon = androidx.media3.ui.R.drawable.exo_icon_pause
    var playPauseButton = arrayOf("pause", "Pause")
    if (state == PlaybackState.STATE_PAUSED) {
      playPauseButton = arrayOf("play", "Pause")
      pausePlayIcon = androidx.media3.ui.R.drawable.exo_icon_play
    }
    session.setPlaybackState(
      PlaybackState.Builder()
        .setState(state, position, 1.0f)
        .addCustomAction(playPauseButton[0], playPauseButton[1], pausePlayIcon)
        .build()
    )
  }

  @SuppressLint("MissingPermission")
  @RequiresApi(Build.VERSION_CODES.O)
  private fun setMetadata(session: MediaSession, trackName: String, artist: String, art: String) {
    val mediaStyle = Notification.MediaStyle().setMediaSession(session.sessionToken)
    val notification = Notification.Builder(context, CHANNEL_ID)
      .setStyle(mediaStyle)
      .setSmallIcon(androidx.media3.ui.R.drawable.exo_icon_play)
      .build()
    // todo move this to a function and add try catch
    val url = URL(art)
    val connection = url.openConnection()
    connection.doInput = true
    connection.connect()
    val input = connection.getInputStream()
    val bitmapArt = BitmapFactory.decodeStream(input)
    // todo
    session.setMetadata(
      MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_TITLE, trackName)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
        .putBitmap(MediaMetadata.METADATA_KEY_ART, bitmapArt)
        .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, bitmapArt)
        .build()
    )
    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
  }

  @RequiresApi(Build.VERSION_CODES.O)
  @JavascriptInterface
  fun createMediaSession(title: String, artist: String): String? {
    val notificationManager = NotificationManagerCompat.from(context)
    val channel = NotificationChannel(CHANNEL_ID, "Media Controls", NotificationManager.IMPORTANCE_MIN)
    notificationManager.createNotificationChannel(channel)
    val session = MediaSession(context, CHANNEL_ID)
    session.setCallback(object: MediaSession.Callback() {
      override fun onCustomAction(action: String, extras: Bundle?) {
        super.onCustomAction(action, extras)
          if (action == "pause") {
            setState(session, PlaybackState.STATE_PAUSED)
          }
          if (action == "play") {
            setState(session, PlaybackState.STATE_PLAYING)
          }
      }
    })
    val mediaStyle = Notification.MediaStyle().setMediaSession(session.sessionToken)
    val notification = Notification.Builder(context, CHANNEL_ID)
      .setStyle(mediaStyle)
      .setSmallIcon(androidx.media3.ui.R.drawable.exo_icon_play)
      .build()
    session.setMetadata(MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, title)
      .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
      .build()
    )
    setState(session, PlaybackState.STATE_PLAYING)
    val sessionId = String.format("%s", UUID.randomUUID()).replace('-', '_')
    mediaSessions[String.format("%s", sessionId)] = session
    if (ActivityCompat.checkSelfPermission(
        context,
        android.Manifest.permission.POST_NOTIFICATIONS
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      context.listenForPermissionsCallbacks {
          i, permissions, results ->
          NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
          context.webView.loadUrl(String.format("javascript: %s%s%s%s%s", "window.callback_", sessionId, "(", results[0] == 0, ")"))
      }
      ActivityCompat.requestPermissions(context, arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 0)

      return String.format("{ \"sessionId\": \"%s\", \"waiting\": true }", sessionId)
    }
    notificationManager.notify(NOTIFICATION_ID, notification)
    return String.format("{ \"sessionId\": \"%s\", \"waiting\": false }", sessionId)
  }

  @JavascriptInterface
  fun updateMediaSessionState(id: String, state: Int, position: Long = 0) {
    if (mediaSessions.keys.contains(id)) {
      val session = mediaSessions[id]
      if (session != null) {
        setState(session, state, position)
      }
    }
  }

  @SuppressLint("NewApi")
  @JavascriptInterface
  fun updateMediaSessionData(id: String, trackName: String, artist: String, art: String) {
    if (mediaSessions.keys.contains(id)) {
      val session = mediaSessions[id]
      if (session != null) {
        setMetadata(session, trackName, artist, art)
      }
    }
  }
}
