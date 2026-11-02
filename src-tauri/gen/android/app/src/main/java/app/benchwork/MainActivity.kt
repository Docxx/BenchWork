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
  private val labelPrinter by lazy { LabelBluetooth(this) }
  override fun onDestroy() {
    Thread { labelPrinter.disconnect() }.start()
    super.onDestroy()
  }

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
    @JavascriptInterface
    fun shareLabelTemplate(name:String,json:String):String {
      return try {
        require(json.length<=5*1024*1024) {"Template is too large to share."}
        val folder=java.io.File(cacheDir,"label-exports").apply {mkdirs()}
        val safe=name.replace(Regex("[^a-zA-Z0-9._-]"),"_").take(100).removeSuffix(".label.json")+".label.json"
        val file=java.io.File(folder,safe)
        require(file.canonicalFile.parentFile==folder.canonicalFile)
        file.writeText(json,Charsets.UTF_8)
        val uri=androidx.core.content.FileProvider.getUriForFile(this@MainActivity,packageName+".labels",file)
        runOnUiThread {startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {type="application/json";putExtra(Intent.EXTRA_STREAM,uri);addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)},"Share label template"))}
        JSONObject().put("ok",true).toString()
      } catch(e:Exception) {JSONObject().put("error",e.message?:"Could not share template").toString()}
    }
    @JavascriptInterface
    fun labelBluetooth(id: String, operation: String, payload: String) {
      Thread {
        try {
          val data=JSONObject(payload)
          val result: Any = when(operation) {
            "scan" -> labelPrinter.scan()
            "connect" -> {labelPrinter.connect(data.getString("id"));JSONObject.NULL}
            "disconnect" -> {labelPrinter.disconnect();JSONObject.NULL}
            "read" -> labelPrinter.read()
            "write" -> {labelPrinter.write(data.getJSONArray("bytes"));JSONObject.NULL}
            else -> throw IllegalArgumentException("Unknown printer operation")
          }
          runOnUiThread {webView?.evaluateJavascript("window.__benchworkLabelReply && window.__benchworkLabelReply(${JSONObject.quote(id)}, true, $result)",null)}
        } catch(e:Exception) {runOnUiThread {webView?.evaluateJavascript("window.__benchworkLabelReply && window.__benchworkLabelReply(${JSONObject.quote(id)}, false, ${JSONObject.quote(e.message?:"Bluetooth operation failed")})",null)}}
      }.start()
    }
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

    /** Private tokens and cache encrypted with a non-exportable Android Keystore key. */
    private fun privateKey(): javax.crypto.SecretKey {
      val store = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val alias = "BenchWork.deviceData.v1"
      val existing = store.getKey(alias, null) as? javax.crypto.SecretKey
      if (existing != null) return existing
      val generator = javax.crypto.KeyGenerator.getInstance("AES", "AndroidKeyStore")
      generator.init(android.security.keystore.KeyGenParameterSpec.Builder(alias,
        android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).build())
      return generator.generateKey()
    }
    @JavascriptInterface
    @Synchronized
    fun secureRead(key: String): String {
      return try {
        require(key.matches(Regex("[a-zA-Z0-9_.-]{1,128}")))
        val data = getSharedPreferences("private-device-data", MODE_PRIVATE).getString(key, null)
          ?: return JSONObject().put("value", JSONObject.NULL).toString()
        val parts = data.split(":")
        val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(javax.crypto.Cipher.DECRYPT_MODE, privateKey(), javax.crypto.spec.GCMParameterSpec(128,
          android.util.Base64.decode(parts[0], android.util.Base64.NO_WRAP)))
        cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
        JSONObject().put("value", String(cipher.doFinal(android.util.Base64.decode(parts[1], android.util.Base64.NO_WRAP)), Charsets.UTF_8)).toString()
      } catch (_: Exception) { JSONObject().put("error", "Private data could not be unlocked. Reconnect the account.").toString() }
    }
    @JavascriptInterface
    @Synchronized
    fun secureWrite(key: String, value: String, remove: Boolean): String {
      return try {
        require(key.matches(Regex("[a-zA-Z0-9_.-]{1,128}")) && value.toByteArray(Charsets.UTF_8).size <= 8 * 1024 * 1024)
        val editor = getSharedPreferences("private-device-data", MODE_PRIVATE).edit()
        if (remove) editor.remove(key)
        else {
          val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
          cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, privateKey())
          cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
          val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
          editor.putString(key, android.util.Base64.encodeToString(cipher.iv, android.util.Base64.NO_WRAP) + ":" + android.util.Base64.encodeToString(encrypted, android.util.Base64.NO_WRAP))
        }
        check(editor.commit())
        "{}"
      } catch (_: Exception) { JSONObject().put("error", "Private data could not be saved on this device.").toString() }
    }

    /** Opens a user-reviewed email draft. The recipient is fixed and nothing is sent. */
    @JavascriptInterface
    fun openFeedbackEmail(subject: String, body: String): String {
      return try {
        require(subject.length <= 200 && !subject.any { it.isISOControl() } && body.length <= 16000) { "Copy the report into your email app instead." }
        val uri = Uri.parse("mailto:raywprice@gmail.com?subject=" + Uri.encode(subject) + "&body=" + Uri.encode(body))
        require(uri.toString().length <= 6000) { "This report is too long. Copy it into your email app instead." }
        startActivity(Intent(Intent.ACTION_SENDTO, uri))
        JSONObject().put("ok", true).toString()
      } catch (_: Exception) {
        JSONObject().put("error", "No email app could open this draft. Copy the report and email it to raywprice@gmail.com.").toString()
      }
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

    /** Reads only a small pairing file selected through Android's document picker. */
    @JavascriptInterface
    fun readSyncPairing(source: String): String {
      return try {
        val uri = Uri.parse(source)
        require(uri.scheme == "content") { "Choose a pairing document" }
        val text = contentResolver.openInputStream(uri).use { input ->
          requireNotNull(input) { "Cannot open pairing file" }
          val bytes = ByteArray(16001)
          var count = 0
          while (count < bytes.size) {
            val n = input.read(bytes, count, bytes.size - count)
            if (n < 0) break
            count += n
          }
          require(count <= 16000) { "Pairing file is too large" }
          String(bytes, 0, count, Charsets.UTF_8)
        }
        JSONObject().put("invitation", JSONObject(text)).toString()
      } catch (e: Exception) {
        JSONObject().put("error", e.message ?: "Cannot read pairing file").toString()
      }
    }

    /** The shared storage folder, where vaults usually live. */
    @JavascriptInterface
    fun sharedStorage(): String = Environment.getExternalStorageDirectory().absolutePath
  }
}
