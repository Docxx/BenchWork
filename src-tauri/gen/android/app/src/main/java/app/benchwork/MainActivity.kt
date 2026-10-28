package app.benchwork

import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * BenchWork's window on Android. The vault is an ordinary folder in shared
 * storage, which Syncthing also writes to, so the app asks for All files
 * access; the page checks and asks through `window.BenchWorkAndroid`.
 */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Android draws apps under the status and navigation bars; keep the page clear of them.
    val content = findViewById<android.view.View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    showBarsFor(resources.configuration)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    showBarsFor(newConfig)
  }

  /** Dark icons on the bars in light mode, light ones in dark mode. */
  private fun showBarsFor(config: Configuration) {
    val dark = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.isAppearanceLightStatusBars = !dark
    controller.isAppearanceLightNavigationBars = !dark
  }

  private var webView: WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(StorageAccess(), "BenchWorkAndroid")
  }

  inner class StorageAccess {
    /**
     * Whether a pen writing in text becomes typed text (Android's own
     * handwriting input). Off while BenchWork's pen draws ink instead.
     */
    @JavascriptInterface
    fun setHandwriting(on: Boolean) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
      runOnUiThread { webView?.setAutoHandwritingEnabled(on) }
    }

    /** Whether BenchWork may read and write any folder. */
    @JavascriptInterface
    fun hasAllFilesAccess(): Boolean =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()

    /** Opens the system screen where All files access is allowed for BenchWork. */
    @JavascriptInterface
    fun askAllFilesAccess() {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
      runOnUiThread {
        val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
        intent.data = Uri.parse("package:$packageName")
        startActivity(intent)
      }
    }

    /** The shared storage folder, where vaults usually live. */
    @JavascriptInterface
    fun sharedStorage(): String = Environment.getExternalStorageDirectory().absolutePath
  }
}
