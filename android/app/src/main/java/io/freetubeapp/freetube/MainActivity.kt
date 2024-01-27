package io.freetubeapp.freetube

import android.os.Bundle
import com.google.android.material.snackbar.Snackbar
import androidx.appcompat.app.AppCompatActivity
import androidx.navigation.findNavController
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.navigateUp
import androidx.navigation.ui.setupActionBarWithNavController
import android.view.Menu
import android.view.MenuItem
import android.webkit.WebView
import io.freetubeapp.freetube.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val w = binding.webView
        w.settings.javaScriptEnabled = true
        w.settings.allowUniversalAccessFromFileURLs = true
        w.settings.allowFileAccessFromFileURLs = true
        w.loadUrl("file:///android_asset/index.html")
    }
}
