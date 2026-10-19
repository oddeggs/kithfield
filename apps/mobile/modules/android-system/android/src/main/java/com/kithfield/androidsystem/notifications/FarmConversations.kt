package com.kithfield.androidsystem.notifications

import android.app.Person
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * Each farm as an Android conversation (`14 Platforms`, 14-07): a long-lived shortcut that a
 * friend's push points at, so the shade draws it in its conversation layout with their critter.
 * The shortcut opens the farm; it goes when the person signs out (`forgetAll`).
 */
object FarmConversations {
  private const val PREFIX = "farm-"

  @RequiresApi(Build.VERSION_CODES.R)
  fun shortcutFor(
    context: Context,
    farm: String,
    name: String?,
    from: Person,
    icon: Icon,
  ): String? {
    val link = SurfaceCritters.farmLink(context, farm) ?: return null
    val manager = context.getSystemService(ShortcutManager::class.java) ?: return null
    val id = PREFIX + farm
    val open = Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(context.packageName)
    val shortcut = ShortcutInfo.Builder(context, id)
      .setShortLabel(name ?: from.name ?: farm)
      .setLongLived(true)
      .setIcon(icon)
      .setPerson(from)
      .setIntent(open)
      .build()
    return try {
      manager.pushDynamicShortcut(shortcut)
      id
    } catch (e: Exception) {
      null
    }
  }

  /** Takes every farm's shortcut away: the farms are someone else's once this person signs out. */
  fun forgetAll(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return
    val manager = context.getSystemService(ShortcutManager::class.java) ?: return
    val ids = manager.dynamicShortcuts.map { it.id }.filter { it.startsWith(PREFIX) }
    if (ids.isEmpty()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) manager.removeLongLivedShortcuts(ids)
    manager.removeDynamicShortcuts(ids)
  }
}
