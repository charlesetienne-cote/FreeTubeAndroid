package io.freetubeapp.freetube

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

open class MediaControlsReceiver : BroadcastReceiver {

  constructor() {
  }
  companion object Static {
    lateinit var main: MainActivity
  }


  override fun onReceive(context: Context?, intent: Intent?) {
    val action = intent!!.action
    main.webView.loadUrl(String.format("javascript: window.notifyMediaSessionListeners('%s')", action))
  }
}
