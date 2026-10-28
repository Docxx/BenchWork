package app.benchwork

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView

/**
 * BenchWork's window on Android. The vault is an ordinary folder in shared
 * storage, which Syncthing also writes to, so the app asks for All files
 * access; the page checks and asks through `window.BenchWorkAndroid`.
 */
class MainActivity : TauriActivity() {
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(StorageAccess(), "BenchWorkAndroid")
  }

  inner class StorageAccess {
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
