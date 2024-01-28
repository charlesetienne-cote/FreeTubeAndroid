package io.freetubeapp.freetube

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationManagerCompat
import java.net.URL
class FreeTubeJavaScriptInterface {
  private var context: MainActivity
  private var mediaSession: MediaSession?
  private var lastPosition: Long
  private var lastState: Int
  companion object {
    private const val CHANNEL_ID = "media_controls"
    private const val NOTIFICATION_ID = 1
  }
  constructor(main: MainActivity) {
    context = main
    mediaSession = null
    lastPosition = 0
    lastState = PlaybackState.STATE_PLAYING
  }
  @JavascriptInterface
  fun createToast(text: String) {
    Toast.makeText(context, text, Toast.LENGTH_LONG).show()
  }
  private fun setState(session: MediaSession, state: Int, position: Long? = null) {
    lastState = state
    var pausePlayIcon = androidx.media3.ui.R.drawable.exo_icon_pause
    var playPauseButton = arrayOf("pause", "Pause")
    if (state == PlaybackState.STATE_PAUSED) {
      playPauseButton = arrayOf("play", "Play")
      pausePlayIcon = androidx.media3.ui.R.drawable.exo_icon_play
    }
    var statePosition: Long
    if (position == null) {
      statePosition = lastPosition
    } else {
      statePosition = position
    }
    session.setPlaybackState(
      PlaybackState.Builder()
        .setState(state, statePosition, 1.0f, )
        .addCustomAction(playPauseButton[0], playPauseButton[1], pausePlayIcon)
        .setActions(PlaybackState.ACTION_SEEK_TO)
        .build()
    )
  }

  @SuppressLint("MissingPermission")
  @RequiresApi(Build.VERSION_CODES.O)
  private fun setMetadata(session: MediaSession, trackName: String, artist: String, duration: Long, art: String?, pushNotification: Boolean = true) {
    val mediaStyle = Notification.MediaStyle().setMediaSession(session.sessionToken)
    var notification: Notification? = null

    if (pushNotification) {
      Notification.Builder(context, CHANNEL_ID)
        .setStyle(mediaStyle)
        .setSmallIcon(androidx.media3.ui.R.drawable.exo_icon_play)
        .build()
    }

    if (art != null) {
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
          .putLong(MediaMetadata.METADATA_KEY_DURATION, duration)
          .build()
      )
    } else {
      session.setMetadata(
        MediaMetadata.Builder()
          .putString(MediaMetadata.METADATA_KEY_TITLE, trackName)
          .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
          .putLong(MediaMetadata.METADATA_KEY_DURATION, duration)
          .build()
      )
    }
    if (pushNotification && notification != null) {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }
  }


  @SuppressLint("MissingPermission")
  @RequiresApi(Build.VERSION_CODES.O)
  @JavascriptInterface
  fun createMediaSession(title: String, artist: String, duration: Long = 0, thumbnail: String? = null) {
    val notificationManager = NotificationManagerCompat.from(context)
    val channel = NotificationChannel(CHANNEL_ID, "Media Controls", NotificationManager.IMPORTANCE_MIN)
    notificationManager.createNotificationChannel(channel)
    var session: MediaSession

    // don't create multiple sessions for one channel
    // it messes with custom actions
    if (mediaSession == null) {
      // add the callbacks && listeners

      session = MediaSession(context, CHANNEL_ID)
      mediaSession = session
      session.setCallback(object : MediaSession.Callback() {
        override fun onCustomAction(action: String, extras: Bundle?) {
          super.onCustomAction(action, extras)
          if (action == "pause") {
            context.runOnUiThread {
              context.webView.loadUrl("javascript: window.notifyMediaSessionListeners('pause')")
            }
          }
          if (action == "play") {
            context.runOnUiThread {
              context.webView.loadUrl("javascript: window.notifyMediaSessionListeners('play')")
            }
          }
        }

        override fun onSeekTo(pos: Long) {
          super.onSeekTo(pos)
          lastPosition = pos
          context.runOnUiThread {
            context.webView.loadUrl(String.format("javascript: window.notifyMediaSessionListeners('seek', %s)", pos))
          }
        }

        override fun onPlay() {
          super.onPlay()
        }

        override fun onPause() {
          super.onPause()
        }
      })
    } else {
      session = mediaSession!!
    }
    val mediaStyle = Notification.MediaStyle().setMediaSession(session.sessionToken)
    val notification = Notification.Builder(context, CHANNEL_ID)
      .setStyle(mediaStyle)
      .setSmallIcon(androidx.media3.ui.R.drawable.exo_icon_play)
      .build()

    // use the set metadata function without pushing a notification
    setMetadata(session, title, artist, duration, thumbnail, false)
    setState(session, PlaybackState.STATE_PLAYING)

    // hush hush ide, this is a special kind of notification which doesn't seem to require permissions
    notificationManager.notify(NOTIFICATION_ID, notification)
  }

  @JavascriptInterface
  fun updateMediaSessionState(state: String?, position: String? = null) {
    var givenState = state?.toInt()
    if (state == null) {
      givenState = lastState
    } else {
    }
    if (position != null) {
      lastPosition = position.toLong()!!
    }
    setState(mediaSession!!, givenState!!, position?.toLong())
  }

  @SuppressLint("NewApi")
  @JavascriptInterface
  fun updateMediaSessionData(trackName: String, artist: String, duration: Long, art: String? = null) {
    setMetadata(mediaSession!!, trackName, artist, duration, art)
  }
}
