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
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.vision.digitalink.DigitalInkRecognition
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions
import com.google.mlkit.vision.digitalink.Ink
import org.json.JSONArray
import org.json.JSONObject

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

  /** British English handwriting, or American if that is not offered. */
  private val inkModel by lazy {
    val id =
      DigitalInkRecognitionModelIdentifier.fromLanguageTag("en-GB")
        ?: DigitalInkRecognitionModelIdentifier.fromLanguageTag("en-US")
    DigitalInkRecognitionModel.builder(id!!).build()
  }
  private val inkRecognizer by lazy {
    DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(inkModel).build())
  }

  /** Answers the page: `window.__benchworkInkReply(id, ok, value)`, with value as JSON. */
  private fun reply(id: String, ok: Boolean, json: String) {
    runOnUiThread {
      webView?.evaluateJavascript(
        "window.__benchworkInkReply && window.__benchworkInkReply(${JSONObject.quote(id)}, $ok, $json)",
        null,
      )
    }
  }

  private fun failed(id: String, e: Exception) = reply(id, false, JSONObject.quote(e.message ?: "Failed"))

  inner class StorageAccess {
    /** Whether the handwriting model is on the tablet. */
    @JavascriptInterface
    fun inkModelReady(id: String) {
      RemoteModelManager.getInstance()
        .isModelDownloaded(inkModel)
        .addOnSuccessListener { reply(id, true, it.toString()) }
        .addOnFailureListener { failed(id, it) }
    }

    /** Downloads the handwriting model, once. */
    @JavascriptInterface
    fun inkPrepare(id: String) {
      RemoteModelManager.getInstance()
        .download(inkModel, DownloadConditions.Builder().build())
        .addOnSuccessListener { reply(id, true, "true") }
        .addOnFailureListener { failed(id, it) }
    }

    /** The text in strokes given as JSON: `[[[x, y, t], ...], ...]`. */
    @JavascriptInterface
    fun inkRecognise(id: String, strokesJson: String) {
      try {
        val strokes = JSONArray(strokesJson)
        val ink = Ink.builder()
        for (i in 0 until strokes.length()) {
          val points = strokes.getJSONArray(i)
          val stroke = Ink.Stroke.builder()
          for (j in 0 until points.length()) {
            val p = points.getJSONArray(j)
            stroke.addPoint(Ink.Point.create(p.getDouble(0).toFloat(), p.getDouble(1).toFloat(), p.getLong(2)))
          }
          ink.addStroke(stroke.build())
        }
        inkRecognizer
          .recognize(ink.build())
          .addOnSuccessListener { result ->
            reply(id, true, JSONObject.quote(result.candidates.firstOrNull()?.text ?: ""))
          }
          .addOnFailureListener { failed(id, it) }
      } catch (e: Exception) {
        failed(id, e)
      }
    }

    /**
     * Whether a pen writing in text becomes typed text (Android's own
     * handwriting input). Off while BenchWork's pen draws ink instead.
     */
    @JavascriptInterface
    fun setHandwriting(on: Boolean) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
      runOnUiThread { webView?.setAutoHandwritingEnabled(on) }
    }

    /** Opens a web address in the tablet's browser; anything but http or https is ignored. */
    @JavascriptInterface
    fun openLink(url: String) {
      val uri = Uri.parse(url)
      if (uri.scheme != "https" && uri.scheme != "http") return
      runOnUiThread {
        try {
          startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: Exception) {
          // No browser to open it.
        }
      }
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
