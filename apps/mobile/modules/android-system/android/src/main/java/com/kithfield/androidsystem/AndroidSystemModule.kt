package com.kithfield.androidsystem

import android.app.AlertDialog
import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.text.InputType
import android.util.TypedValue
import android.view.ViewGroup
import android.webkit.MimeTypeMap
import android.widget.EditText
import android.widget.FrameLayout
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/** A list of choices, as iOS's action sheet offers them. */
class ChoiceOptions : Record {
  @Field val title: String? = null
  @Field val options: List<String> = emptyList()
  /** Shown as the dialog's dismiss button; the list leaves it out. */
  @Field val cancel: String? = null
  @Field val dark: Boolean = false
}

/** A one-line text question, as iOS's `Alert.prompt` asks it. */
class PromptOptions : Record {
  @Field val title: String = ""
  @Field val message: String? = null
  @Field val initial: String? = null
  @Field val ok: String = "OK"
  @Field val cancel: String = "Cancel"
  @Field val dark: Boolean = false
}

/**
 * The Android side of what iOS gives the app for free: Material dialogs for a list of choices
 * and a text prompt, and what other apps share into Kithfield (text, a link, photos).
 */
class AndroidSystemModule : Module() {
  private var pendingShare: Map<String, Any?>? = null
  private var backPreview: OnBackPressedCallback? = null

  override fun definition() = ModuleDefinition {
    Name("AndroidSystem")

    Events("onShare", "onBackPreview")

    OnCreate {
      appContext.currentActivity?.intent?.let { readShare(it, emit = false) }
    }

    OnNewIntent { intent -> readShare(intent, emit = true) }

    AsyncFunction("chooseAsync") { options: ChoiceOptions, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(-1)
        return@AsyncFunction
      }
      activity.runOnUiThread {
        var answered = false
        val answer = { index: Int ->
          if (!answered) {
            answered = true
            promise.resolve(index)
          }
        }
        val builder = AlertDialog.Builder(activity, theme(options.dark))
          .setItems(options.options.toTypedArray()) { _, which -> answer(which) }
          .setOnCancelListener { answer(-1) }
          .setOnDismissListener { answer(-1) }
        options.title?.let { builder.setTitle(it) }
        options.cancel?.let { builder.setNegativeButton(it) { _, _ -> answer(-1) } }
        builder.show()
      }
    }

    AsyncFunction("promptAsync") { options: PromptOptions, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      activity.runOnUiThread {
        val dp = { value: Float ->
          TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, activity.resources.displayMetrics).toInt()
        }
        val input = EditText(activity).apply {
          inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
          setSingleLine(true)
          setText(options.initial ?: "")
          setSelection(text.length)
        }
        val frame = FrameLayout(activity).apply {
          setPadding(dp(24f), dp(8f), dp(24f), 0)
          addView(input, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        var answered = false
        val answer = { value: String? ->
          if (!answered) {
            answered = true
            promise.resolve(value)
          }
        }
        val builder = AlertDialog.Builder(activity, theme(options.dark))
          .setTitle(options.title)
          .setView(frame)
          .setPositiveButton(options.ok) { _, _ -> answer(input.text.toString()) }
          .setNegativeButton(options.cancel) { _, _ -> answer(null) }
          .setOnDismissListener { answer(null) }
        options.message?.let { builder.setMessage(it) }
        val dialog = builder.create()
        dialog.window?.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
        dialog.show()
        input.requestFocus()
      }
    }

    /**
     * While on, the back gesture is the app's to draw (Android 14's predictive back): its
     * progress and where the finger is reach JavaScript, and letting go past the edge commits it.
     */
    AsyncFunction("setBackPreview") { enabled: Boolean ->
      val activity = appContext.currentActivity as? ComponentActivity ?: return@AsyncFunction
      activity.runOnUiThread {
        backPreview?.remove()
        backPreview = null
        if (!enabled) return@runOnUiThread
        val density = activity.resources.displayMetrics.density
        val send = { phase: String, event: BackEventCompat? ->
          sendEvent(
            "onBackPreview",
            mapOf(
              "phase" to phase,
              "progress" to (event?.progress?.toDouble() ?: 0.0),
              "y" to ((event?.touchY ?: 0f) / density).toDouble(),
              "edge" to if (event?.swipeEdge == BackEventCompat.EDGE_RIGHT) "right" else "left",
            ),
          )
        }
        val callback = object : OnBackPressedCallback(true) {
          override fun handleOnBackStarted(backEvent: BackEventCompat) = send("start", backEvent)
          override fun handleOnBackProgressed(backEvent: BackEventCompat) = send("progress", backEvent)
          override fun handleOnBackCancelled() = send("cancel", null)
          override fun handleOnBackPressed() = send("commit", null)
        }
        activity.onBackPressedDispatcher.addCallback(callback)
        backPreview = callback
      }
    }

    /** What another app shared and the app hasn't taken yet, once. */
    Function("takeShare") {
      val share = pendingShare
      pendingShare = null
      share
    }
  }

  private fun theme(dark: Boolean): Int =
    if (dark) android.R.style.Theme_DeviceDefault_Dialog_Alert
    else android.R.style.Theme_DeviceDefault_Light_Dialog_Alert

  /** Reads a share intent: its text, and its photos copied into the app's cache. */
  private fun readShare(intent: Intent, emit: Boolean) {
    val action = intent.action
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
    val context = appContext.reactContext ?: return
    val streams = mutableListOf<Uri>()
    if (action == Intent.ACTION_SEND) {
      streamOf(intent)?.let { streams.add(it) }
    } else {
      streamsOf(intent)?.let { streams.addAll(it) }
    }
    val dir = File(context.cacheDir, "shared").apply { mkdirs() }
    // Only another app's content: a `file://` stream could name the app's own private files.
    val shared = streams.filter { uri ->
      uri.scheme == "content" && uri.authority?.startsWith(context.packageName) != true
    }
    val files = shared.take(MAX_FILES).mapNotNull { uri ->
      var out: File? = null
      try {
        val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
        var name: String? = null
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) name = cursor.getString(0)
        }
        val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "bin"
        val copy = File(dir, "${UUID.randomUUID()}.$ext")
        out = copy
        val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
          copy.outputStream().use { copyAtMost(input, it, MAX_BYTES) }
        } ?: -1L
        if (bytes < 1 || bytes > MAX_BYTES) {
          copy.delete()
          return@mapNotNull null
        }
        mapOf("uri" to Uri.fromFile(copy).toString(), "mime" to mime, "name" to (name ?: copy.name), "bytes" to bytes.toDouble())
      } catch (e: Exception) {
        out?.delete()
        null
      }
    }
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    if (text.isNullOrBlank() && files.isEmpty()) return
    val share = mapOf("text" to text, "subject" to intent.getStringExtra(Intent.EXTRA_SUBJECT), "files" to files)
    pendingShare = share
    // Taken once: a relaunch from recents doesn't share it again.
    intent.action = Intent.ACTION_MAIN
    if (emit) sendEvent("onShare", mapOf("pending" to true))
  }

  /** Copies up to `limit` bytes and one more, so a stream past the limit is known to be. */
  private fun copyAtMost(input: InputStream, output: OutputStream, limit: Long): Long {
    val buffer = ByteArray(64 * 1024)
    var total = 0L
    while (total <= limit) {
      val read = input.read(buffer)
      if (read < 0) break
      output.write(buffer, 0, read)
      total += read
    }
    return total
  }

  @Suppress("DEPRECATION")
  private fun streamOf(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableExtra(Intent.EXTRA_STREAM)

  @Suppress("DEPRECATION")
  private fun streamsOf(intent: Intent): List<Uri>? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)

  companion object {
    /** As many as the iOS share extension takes. */
    private const val MAX_FILES = 10
    /** The upload limit (`LIMITS.uploadBytes`): a larger file is left out, as on iOS. */
    private const val MAX_BYTES = 100L * 1024 * 1024
  }
}
