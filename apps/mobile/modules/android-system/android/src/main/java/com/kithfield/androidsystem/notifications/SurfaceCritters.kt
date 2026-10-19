package com.kithfield.androidsystem.notifications

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import org.json.JSONObject
import java.io.File

/**
 * The critters the app last drew for its surfaces (`APP_GROUP_PATHS` in the contracts, kept in the
 * app's documents on Android, `features/android/surface-root`): each farm's people and their
 * pre-rendered critter, read here so a push can show who it's from without starting JavaScript.
 */
object SurfaceCritters {
  /** `Paths.document` and the folder the surfaces write into. */
  private const val ROOT = "surfaces-group"
  private const val DATA = "surfaces/data.json"
  private const val IMAGES = "surfaces/images/"
  private val IMAGE_NAME = Regex("^[a-z0-9_-]{1,80}\\.png$")

  /** `person`'s critter on `farm` (a member, or the friend a visit is with), or null. */
  fun avatar(context: Context, farm: String, person: String): Bitmap? {
    val root = File(context.filesDir, ROOT)
    val data = File(root, DATA).takeIf { it.isFile } ?: return null
    val image = try {
      imageOf(JSONObject(data.readText()), farm, person)
    } catch (e: Exception) {
      null
    } ?: return null
    if (!IMAGE_NAME.matches(image)) return null
    val file = File(root, IMAGES + image).takeIf { it.isFile } ?: return null
    return BitmapFactory.decodeFile(file.path)?.let(::round)
  }

  /** The critter in a circle, as the design draws a friend beside their message. */
  private fun round(square: Bitmap): Bitmap {
    val size = minOf(square.width, square.height)
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    canvas.drawBitmap(square, (size - square.width) / 2f, (size - square.height) / 2f, paint)
    return out
  }

  /** The link that opens `farm` in this build (its own scheme), as the surfaces wrote it. */
  fun farmLink(context: Context, farm: String): String? {
    val data = File(File(context.filesDir, ROOT), DATA).takeIf { it.isFile } ?: return null
    return try {
      val farms = JSONObject(data.readText()).optJSONArray("farms") ?: return null
      (0 until farms.length())
        .mapNotNull { farms.optJSONObject(it) }
        .firstOrNull { it.optString("farm") == farm }
        ?.optString("link")
        ?.takeIf { it.isNotEmpty() }
    } catch (e: Exception) {
      null
    }
  }

  private fun imageOf(data: JSONObject, farm: String, person: String): String? {
    val farms = data.optJSONArray("farms") ?: return null
    for (i in 0 until farms.length()) {
      val entry = farms.optJSONObject(i) ?: continue
      if (entry.optString("farm") != farm) continue
      val critters = entry.optJSONArray("critters")
      if (critters != null) {
        for (j in 0 until critters.length()) {
          val critter = critters.optJSONObject(j) ?: continue
          if (critter.optString("person") == person) return critter.optString("image")
        }
      }
      val with = entry.optJSONObject("with")
      if (with != null && with.optString("person") == person) return with.optString("image")
    }
    return null
  }
}
