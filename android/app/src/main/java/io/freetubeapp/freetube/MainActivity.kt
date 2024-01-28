package io.freetubeapp.freetube

import android.content.Intent
import android.os.Bundle
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
