package io.freetubeapp.freetube

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.addCallback
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat.OnRequestPermissionsResultCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import io.freetubeapp.freetube.databinding.ActivityMainBinding


class MainActivity : AppCompatActivity(), OnRequestPermissionsResultCallback {

  private lateinit var binding: ActivityMainBinding
  private lateinit var permissionsListeners: MutableList<(Int, Array<String?>, IntArray) -> Unit>
  private lateinit var activityResultListeners: MutableList<(ActivityResult?) -> Unit>
  private lateinit var keepAliveService: KeepAliveService
  private lateinit var keepAliveIntent: Intent
  private var fullscreenView: View? = null
  lateinit var webView: BackgroundPlayWebView
  lateinit var jsInterface: FreeTubeJavaScriptInterface
  lateinit var activityResultLauncher: ActivityResultLauncher<Intent>
  @Suppress("DEPRECATION")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    activityResultListeners = mutableListOf()

    activityResultLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
      for (listener in activityResultListeners) {
        listener(it)
      }
      // clear the listeners
      activityResultListeners = mutableListOf()
    }

    MediaControlsReceiver.notifyMediaSessionListeners = {
      action ->
      webView.loadUrl(String.format("javascript: window.notifyMediaSessionListeners('%s')", action))
    }
    // this keeps android from shutting off the app to conserve battery
    keepAliveService = KeepAliveService()
    keepAliveIntent = Intent(this, keepAliveService.javaClass)
    startService(keepAliveIntent)

    // this gets the controller for hiding and showing the system bars
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val windowInsetsController =
      WindowCompat.getInsetsController(window, window.decorView)
    windowInsetsController.systemBarsBehavior =
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

    // initialize the list of listeners for permissions handlers
    permissionsListeners = arrayOf<(Int, Array<String?>, IntArray) -> Unit>().toMutableList()

    binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)
    webView = binding.webView

    // bind the back button to the web-view history
    onBackPressedDispatcher.addCallback {
      if (webView.canGoBack()) {
        webView.goBack()
      } else {
        this@MainActivity.moveTaskToBack(true)
      }
    }

    webView.settings.javaScriptEnabled = true

    // this is the 🥃 special sauce that makes local api streaming a possibility
    webView.settings.allowUniversalAccessFromFileURLs = true
    webView.settings.allowFileAccessFromFileURLs = true
    // allow playlist ▶auto-play in background
    webView.settings.mediaPlaybackRequiresUserGesture = false

    jsInterface = FreeTubeJavaScriptInterface(this)
    webView.addJavascriptInterface(jsInterface, "Android")
    webView.webChromeClient = object: WebChromeClient() {

      override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
        windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
        fullscreenView = view!!
        view.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        this@MainActivity.binding.root.addView(view)
        webView.visibility = View.GONE
        this@MainActivity.binding.root.fitsSystemWindows = false
      }

      override fun onHideCustomView() {
        webView.visibility = View.VISIBLE
        this@MainActivity.binding.root.removeView(fullscreenView)
        fullscreenView = null
        windowInsetsController.show(WindowInsetsCompat.Type.systemBars())
        this@MainActivity.binding.root.fitsSystemWindows = true
      }
    }
    webView.webViewClient = object: WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        if (request!!.url!!.scheme == "file") {
          // don't send file url requests to a web browser (it will crash the app)
          return true
        }
        val regex = """^https?:\/\/((www\.)?youtube\.com(\/embed)?|youtu\.be)\/.*$"""

        if (Regex(regex).containsMatchIn(request!!.url!!.toString())) {
          webView.loadUrl("javascript: window.notifyYoutubeLinkHandlers(\"${request!!.url}\")")
          return true
        }
        // send all requests to a real web browser
        val intent = Intent(Intent.ACTION_VIEW, request!!.url)
        this@MainActivity.startActivity(intent)
        return true
      }
      override fun onPageFinished(view: WebView?, url: String?) {
        webView.loadUrl(
          "javascript: window.mediaSessionListeners = window.mediaSessionListeners || {};" +
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
            "};" +
            "window.awaitAsyncResult = function (id) {" +
              "    return new Promise((resolve, reject) => {" +
              "        const interval = setInterval(async () => {" +
              "            if (id in window) {" +
              "                clearInterval(interval);" +
              "                try {" +
              "                    const result = await window[id].promise;" +
              "                    resolve(result)" +
              "                } catch (ex) {" +
              "                    reject(ex)" +
              "                }" +
              "            }" +
              "        }, 1)" +
              "    }) " +
              "};" +
              "window.youtubeLinkHandlers = window.youtubeLinkHandlers || [];" +
              "window.addYoutubeLinkHandler = function (handler) {" +
              "  const i = window.youtubeLinkHandlers.length;" +
              "  window.youtubeLinkHandlers.push(handler);" +
              "  return i" +
              "};" +
              "window.notifyYoutubeLinkHandlers = function (message) {" +
              "  window.youtubeLinkHandlers.forEach((handler) => handler(message))" +
              "}"
        )
        super.onPageFinished(view, url)
      }
    }

    webView.loadUrl("file:///android_asset/index.html")

  }

  fun listenForPermissionsCallbacks(listener: (Int, Array<String?>, IntArray) -> Unit) {
    permissionsListeners.add(listener)
  }
  fun listenForActivityResults(listener: (ActivityResult?) -> Unit) {
    activityResultListeners.add(listener)
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

  @SuppressLint("MissingSuperCall")
  override fun onNewIntent(intent: Intent?) {
    val uri = intent!!.data
    val isYT = uri!!.host!! == "www.youtube.com" || uri!!.host!! == "youtube.com" || uri!!.host!! == "m.youtube.com" || uri!!.host!! == "youtu.be"
    val url = if (!isYT) {
      uri.toString().replace(uri.host.toString(), "www.youtube.com")
    } else {
      uri
    }
    webView.loadUrl("javascript: window.notifyYoutubeLinkHandlers(\"${url}\")")
  }

  override fun onDestroy() {
    super.onDestroy()
    stopService(keepAliveIntent)
    jsInterface.cancelMediaNotification()
    webView.destroy()
  }
}
