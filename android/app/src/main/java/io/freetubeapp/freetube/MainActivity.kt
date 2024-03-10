package io.freetubeapp.freetube

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.PowerManager
import android.os.PowerManager.WakeLock
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
import java.net.URLEncoder
import java.util.UUID.randomUUID


class MainActivity : AppCompatActivity(), OnRequestPermissionsResultCallback {

  private lateinit var binding: ActivityMainBinding
  private lateinit var permissionsListeners: MutableList<(Int, Array<String?>, IntArray) -> Unit>
  private lateinit var activityResultListeners: MutableList<(ActivityResult?) -> Unit>
  private lateinit var keepAliveService: KeepAliveService
  private lateinit var keepAliveIntent: Intent
  private var fullscreenView: View? = null
  /**
   * 🧊🥶
   */
  private var isColdStart: Boolean = true
  lateinit var webView: BackgroundPlayWebView
  lateinit var jsInterface: FreeTubeJavaScriptInterface
  lateinit var activityResultLauncher: ActivityResultLauncher<Intent>
  lateinit var wakeLock: WakeLock
  lateinit var content: View
  var releasedWakeLock: Boolean = false
  var paused: Boolean = false
  var showSplashScreen: Boolean = true
  companion object {
    val POWER_MANAGER_TAG: String = "${randomUUID()}"
  }
  @Suppress("DEPRECATION")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (isColdStart) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(PowerManager.FULL_WAKE_LOCK, POWER_MANAGER_TAG)
      /*
      commenting this out until issues with the splash screen making the app invisible can be addressed

      content = findViewById(android.R.id.content)
      content.viewTreeObserver.addOnPreDrawListener(
        object : ViewTreeObserver.OnPreDrawListener {
          override fun onPreDraw(): Boolean {
            // Check whether the initial data is ready.
            return if (!showSplashScreen) {
              // The content is ready. Start drawing.
              content.viewTreeObserver.removeOnPreDrawListener(this)
              true
            } else {
              // The content isn't ready. Suspend.
              false
            }
          }
        }
      )*/
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
      webView.setBackgroundColor(Color.TRANSPARENT)

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
      if (intent!!.data !== null) {
        val url = intent!!.data.toString()
        val host = intent!!.data!!.host.toString()
        val intentPath = if (host != "youtube.com" && host != "youtu.be" && host != "m.youtube.com" && host != "www.youtube.com") {
          url.replace("${intent!!.data!!.host}", "youtube.com")
        } else {
          url
        }
        val intentEncoded = URLEncoder.encode(intentPath)
        webView.loadUrl("file:///android_asset/index.html?intent=${intentEncoded}")
      } else {
        webView.loadUrl("file:///android_asset/index.html")
      }
      // 😌🔥
      isColdStart = false
    }
  }

  fun listenForPermissionsCallbacks(listener: (Int, Array<String?>, IntArray) -> Unit) {
    permissionsListeners.add(listener)
  }
  fun listenForActivityResults(listener: (ActivityResult?) -> Unit) {
    activityResultListeners.add(listener)
  }

  fun consoleError(message: String) {
    val messageEncoded = URLEncoder.encode(message, "utf-8")
    webView.loadUrl("javascript: console.error(decodeURIComponent(\"${messageEncoded}\"))")
  }

  fun consoleWarn(message: String) {
    val messageEncoded = URLEncoder.encode(message, "utf-8")
    webView.loadUrl("javascript: console.warn(decodeURIComponent(\"$messageEncoded\"))")
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

  /**
   * handles new intents which involve deep links (aka supported links)
   */
  @SuppressLint("MissingSuperCall")
  override fun onNewIntent(intent: Intent?) {
    if (intent!!.data !== null) {
      val uri = intent!!.data
      val isYT =
        uri!!.host!! == "www.youtube.com" || uri!!.host!! == "youtube.com" || uri!!.host!! == "m.youtube.com" || uri!!.host!! == "youtu.be"
      val url = if (!isYT) {
        uri.toString().replace(uri.host.toString(), "www.youtube.com")
      } else {
        uri
      }
      webView.loadUrl("javascript: window.notifyYoutubeLinkHandlers(\"${url}\")")
    }
  }

  override fun onPause() {
    try {
      super.onPause()
      paused = true
      if (wakeLock.isHeld) {
        wakeLock.release()
        releasedWakeLock = true
      }
    } catch (exception: Exception) {
      consoleWarn(exception.toString())
    }
  }

  override fun onResume() {
    super.onResume()
    if (paused !== false) {
      // if paused state is false, but we are resuming, the app is starting
      try {
        showSplashScreen = false
      } catch (ex: Exception) {
        consoleWarn(ex.toString())
      }
    }
    paused = false
    if (releasedWakeLock) {
      wakeLock.acquire()
      releasedWakeLock = false
    }
  }

  override fun onDestroy() {
    // stop the keep alive service
    stopService(keepAliveIntent)
    // cancel media notification (if there is one)
    jsInterface.cancelMediaNotification()
    // clean up the web view
    webView.destroy()
    // call `super`
    super.onDestroy()
  }
}
