package io.freetubeapp.freetube

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

class MediaControlsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context?, intent: Intent?) {
    Toast.makeText(context, intent!!.action, Toast.LENGTH_LONG).show()
  }

}
