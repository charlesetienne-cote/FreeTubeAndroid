package io.freetubeapp.freetube

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat.OnRequestPermissionsResultCallback
import io.freetubeapp.freetube.databinding.ActivityMainBinding



class MainActivity : AppCompatActivity(), OnRequestPermissionsResultCallback {

  private lateinit var binding: ActivityMainBinding
  private lateinit var permissionsListeners: MutableList<(Int, Array<String?>, IntArray) -> Unit>
  lateinit var webView: BackgroundPlayWebView
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    permissionsListeners = arrayOf<(Int, Array<String?>, IntArray) -> Unit>().toMutableList()
    binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)

    webView = binding.webView
    webView.settings.javaScriptEnabled = true
    // this is the 🥃 special sauce that makes local api streaming a possibility:
    @Suppress("DEPRECATION")
    webView.settings.allowUniversalAccessFromFileURLs = true
    @Suppress("DEPRECATION")
    webView.settings.allowFileAccessFromFileURLs = true

    val jsInterface = FreeTubeJavaScriptInterface(this)
    webView.addJavascriptInterface(jsInterface, "Android")

    webView.loadUrl("file:///android_asset/index.html")
    Handler(Looper.getMainLooper()).postDelayed({
      webView.loadUrl(
        "javascript: window.mediaSessionListeners = {};" +
          "window.addMediaSessionEventListener = function (eventName, listener) {" +
          "  if (!(eventName in window.mediaSessionListeners)) {" +
          "    window.mediaSessionListeners[eventName] = [];" +
          "  }" +
          "  window.mediaSessionListeners[eventName].push(listener);" +
          "};" +
          "window.notifyMediaSessionListeners = function (eventName, ...message) {" +
          "if ((eventName in window.mediaSessionListeners)) {" +
          "    window.mediaSessionListeners[eventName].forEach(listener => listener(...message));" +
          "  }" +
          "};" +
          "window.clearAllMediaSessionEventListeners = function () {" +
          "    window.mediaSessionListeners = {}" +
          "};"
      )
    }, 100)

  }

  fun listenForPermissionsCallbacks(listener: (Int, Array<String?>, IntArray) -> Unit) {
    permissionsListeners.add(listener)
  }
  override fun onRequestPermissionsResult(
    requestCode: Int, permissions: Array<String?>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    permissionsListeners.forEach {
      it(requestCode, permissions, grantResults)
    }
    permissionsListeners.clear()
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
  }
}
