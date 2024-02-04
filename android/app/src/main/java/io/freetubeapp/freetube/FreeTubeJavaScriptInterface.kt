package io.freetubeapp.freetube

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.webkit.JavascriptInterface
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationManagerCompat
import java.io.File
import java.io.FileInputStream
import java.net.URL
import java.util.UUID.*

class FreeTubeJavaScriptInterface {
  private var context: MainActivity
  private var mediaSession: MediaSession?
  private var lastPosition: Long
  private var lastState: Int
  private var lastNotification: Notification? = null

  companion object {
    private const val DATA_DIRECTORY = "data://"
    private const val CHANNEL_ID = "media_controls"
    private val NOTIFICATION_ID = (2..1000).random()
    private val NOTIFICATION_TAG = String.format("%s", randomUUID())
  }

  constructor(main: MainActivity) {
    context = main
    mediaSession = null
    lastPosition = 0
    lastState = PlaybackState.STATE_PLAYING
  }

  /**
   * Returns a directory given a directory (returns the full directory for shortened directories like `data://`)
   */
  private fun getDirectory(directory: String): String {
    val path =  if (directory == DATA_DIRECTORY) {
      // this is the directory cordova gave us access to before
      context.getExternalFilesDir(null)!!.parent
    } else {
      directory
    }
    return path
  }

  /**
   * retrieves actions for the media controls
   * @param state the current state of the media controls (ex PlaybackState.STATE_PLAYING or PlaybackState.STATE_PAUSED
   */
  private fun getActions(state: Int = lastState): Array<Notification.Action> {
    var neutralAction = arrayOf("Pause", "pause")
    var neutralIcon = androidx.media3.ui.R.drawable.exo_icon_pause
    if (state == PlaybackState.STATE_PAUSED) {
      neutralAction = arrayOf("Play", "play")
      neutralIcon = androidx.media3.ui.R.drawable.exo_icon_play
    }
    return arrayOf(
      Notification.Action.Builder(
        androidx.media3.ui.R.drawable.exo_ic_skip_previous,
        "Back",
        PendingIntent.getBroadcast(context, 1, Intent(context, MediaControlsReceiver::class.java).setAction("previous"), PendingIntent.FLAG_IMMUTABLE)
      ).build(),
      Notification.Action.Builder(
        neutralIcon,
        neutralAction[0],
        PendingIntent.getBroadcast(context, 1, Intent(context, MediaControlsReceiver::class.java).setAction(neutralAction[1]), PendingIntent.FLAG_IMMUTABLE)
      ).build(),
      Notification.Action.Builder(
        androidx.media3.ui.R.drawable.exo_ic_skip_next,
        "Next",
        PendingIntent.getBroadcast(context, 1, Intent(context, MediaControlsReceiver::class.java).setAction("next"), PendingIntent.FLAG_IMMUTABLE)
      ).build()
    )
  }

  /**
   * retrieves the media style for the media controls notification
   */
  private fun getMediaStyle(): Notification.MediaStyle? {
    if (mediaSession != null) {
      return Notification.MediaStyle()
        .setMediaSession(mediaSession!!.sessionToken).setShowActionsInCompactView(0, 1, 2)
    } else {
      return null
    }
  }

  /**
   * Gets a fresh media controls notification given the current `mediaSession`
   * @param actions a list of actions for the media controls (defaults to `getActions()`)
   */
  @RequiresApi(Build.VERSION_CODES.O)
  private fun getMediaControlsNotification(actions: Array<Notification.Action> = getActions()): Notification? {
    val mediaStyle = getMediaStyle()
    if (mediaStyle != null) {
      // when clicking the notification, launch the app as if the user tapped on it in their launcher (open an existing instance if able)
      val notificationIntent = Intent(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_LAUNCHER)
        .setClass(context,  MainActivity::class.java)
      return Notification.Builder(context, CHANNEL_ID)
        .setStyle(getMediaStyle())
        .setSmallIcon(R.drawable.ic_media_notification_icon)
        .addAction(
          actions[0]
        )
        .addAction(
          actions[1]
        )
        .addAction(
          actions[2]
        )
        .setContentIntent(
          PendingIntent.getActivity(
            context, 1, notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          )
        )
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .build()
    } else {
      return null
    }
  }

  /**
   * pushes a notification
   * @param notification the notification the be pushed (usually a media controls notification)
   */
  @SuppressLint("MissingPermission")
  private fun pushNotification(notification: Notification) {
    val manager = NotificationManagerCompat.from(context)
    // cancel any existing notifications
    manager.cancel(NOTIFICATION_ID)
    manager.notify(NOTIFICATION_TAG, NOTIFICATION_ID, notification)
    lastNotification = notification
  }

  /**
   * sets the state of the media session
   * @param session the current media session
   * @param state the state of playback
   * @param position the position in milliseconds of playback
   */
  @SuppressLint("MissingPermission")
  private fun setState(session: MediaSession, state: Int, position: Long? = null) {

    if (state != lastState) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        // need to reissue a notification if we want to update the actions
        var actions = getActions(state)
        val notification = getMediaControlsNotification(actions)
        pushNotification(notification!!)
      }
    }
    lastState = state
    var statePosition: Long
    if (position == null) {
      statePosition = lastPosition
    } else {
      statePosition = position
    }
    session.setPlaybackState(
      PlaybackState.Builder()
        .setState(state, statePosition, 1.0f)
        .setActions(PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or
        PlaybackState.ACTION_PLAY_FROM_MEDIA_ID or
        PlaybackState.ACTION_PLAY_FROM_SEARCH or PlaybackState.ACTION_SEEK_TO)
        .build()
    )
  }

  /**
   * sets the metadata of the media session
   * @param session the current media session
   * @param trackName the video name
   * @param artist the channel name
   * @param duration duration in milliseconds
   */
  @SuppressLint("MissingPermission")
  @RequiresApi(Build.VERSION_CODES.O)
  private fun setMetadata(session: MediaSession, trackName: String, artist: String, duration: Long, art: String?, pushNotification: Boolean = true) {
    var notification: Notification? = null
    if (pushNotification) {
      notification = getMediaControlsNotification()
    }

    if (art != null) {
      // todo move this to a function and add try catch
      val connection = URL(art).openConnection()
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
      pushNotification(notification)
    }
  }

  /**
   * creates (or updates) a media session
   * @param title the track name / video title
   * @param artist the author / channel name
   * @param duration the duration in milliseconds of the video
   * @param thumbnail a URL to the thumbnail for the video
   */
  @SuppressLint("MissingPermission")
  @RequiresApi(Build.VERSION_CODES.O)
  @JavascriptInterface
  fun createMediaSession(title: String, artist: String, duration: Long = 0, thumbnail: String? = null) {
    val notificationManager = NotificationManagerCompat.from(context)
    val channel = NotificationChannel(CHANNEL_ID, "Media Controls", NotificationManager.IMPORTANCE_MIN)
    channel.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
    notificationManager.createNotificationChannel(channel)
    var session: MediaSession

    // don't create multiple sessions for one channel
    // it messes with custom actions
    if (mediaSession == null) {
      // add the callbacks && listeners

      session = MediaSession(context, CHANNEL_ID)
      session.isActive = true
      mediaSession = session
      session.setCallback(object : MediaSession.Callback() {
        override fun onSkipToNext() {
          super.onSkipToNext()
          context.runOnUiThread {
            context.webView.loadUrl("javascript: window.notifyMediaSessionListeners('next')")
          }
        }

        override fun onSkipToPrevious() {
          super.onSkipToPrevious()
          context.runOnUiThread {
            context.webView.loadUrl("javascript: window.notifyMediaSessionListeners('previous')")
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
          context.runOnUiThread {
            context.webView.loadUrl("javascript: window.notifyMediaSessionListeners('play')")
          }
        }

        override fun onPause() {
          super.onPause()
          context.runOnUiThread {
            context.webView.loadUrl("javascript: window.notifyMediaSessionListeners('pause')")
          }
        }
      })
    } else {
      session = mediaSession!!
    }

    val notification = getMediaControlsNotification()
    // use the set metadata function without pushing a notification
    setMetadata(session, title, artist, duration, thumbnail, false)
    setState(session, PlaybackState.STATE_PLAYING)

    pushNotification(notification!!)
  }

  /**
   * updates the state of the active media session
   * @param state the state; should be an Int (as a string because the java bridge)
   * @param position the position; should be a Long (as a string because the java bridge)
   */
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

  /**
   * updates the metadata of the active media session
   * @param trackName the video title
   * @param artist the channel name
   * @param duration the length of the video in milliseconds
   * @param art the URL to the video thumbnail
   */
  @SuppressLint("NewApi")
  @JavascriptInterface
  fun updateMediaSessionData(trackName: String, artist: String, duration: Long, art: String? = null) {
    setMetadata(mediaSession!!, trackName, artist, duration, art)
  }

  @JavascriptInterface
  fun cancelMediaNotification() {
    val manager = NotificationManagerCompat.from(context)
    manager.cancel(NOTIFICATION_TAG, NOTIFICATION_ID)
  }

  @JavascriptInterface
  fun readFile(basedir: String, filename: String): String {
    try {
      val path = getDirectory(basedir)
      val file = File(path, filename)
      return FileInputStream(file).bufferedReader().use { it.readText() }
    } catch (ex: Exception) {
      return ""
    }
  }

  @JavascriptInterface
  fun writeFile(basedir: String, filename: String, content: String): Boolean {
    try {
      val path = getDirectory(basedir)
      var file = File(path, filename)
      file.writeText(content)
      return true
    } catch (ex: Exception) {
      return false
    }
  }
}
