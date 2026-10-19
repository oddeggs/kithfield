package com.kithfield.androidsystem.notifications

import android.app.Person
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Log
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import org.json.JSONObject
import android.app.Notification as AndroidNotification

/**
 * Draws Kithfield's pushes (`14 Platforms`, 14-07). expo-notifications builds the notification
 * (its channel, actions, tap and tag); a push from a friend then becomes their message in
 * MessagingStyle, with their critter as the picture and the farm's name beside the app's, and the
 * quiet "a few things" roundup is drawn without a sound in whichever channel it arrives.
 */
class ConversationPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  override suspend fun createNotification(
    notification: Notification,
    notificationBehavior: NotificationBehaviorRecord?,
  ): AndroidNotification {
    val data = pushData(notification)
    val behavior =
      if (data["sound"] == "false") {
        (notificationBehavior ?: NotificationBehaviorRecord.ALLOW_ALL).copy(shouldPlaySound = false)
      } else {
        notificationBehavior
      }
    val built = super.createNotification(notification, behavior)
    val sender = senderOf(data) ?: return built
    return try {
      asMessage(built, notification, sender, farmOf(data))
    } catch (e: Exception) {
      Log.w(TAG, "Drawing a push as a message failed; it goes out as built.", e)
      built
    }
  }

  private fun asMessage(
    built: AndroidNotification,
    notification: Notification,
    sender: Sender,
    farm: String?,
  ): AndroidNotification {
    val content = notification.notificationRequest.content
    val critter = farm?.let { SurfaceCritters.avatar(context, it, sender.person) }
    val builder = AndroidNotification.Builder.recoverBuilder(context, built)
    // The farm's name sits in the header, after the app's (the design's "Kithfield · The Thursday Lot").
    content.title?.let { builder.setSubText(it) }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      critter?.let { builder.setLargeIcon(it) }
      return builder.build()
    }
    val icon = critter?.let { Icon.createWithBitmap(it) }
    val from = Person.Builder().setName(sender.name).setKey(sender.person).apply {
      icon?.let { setIcon(it) }
    }.build()
    val you = Person.Builder()
      .setName(context.applicationInfo.loadLabel(context.packageManager))
      .build()
    val style = AndroidNotification.MessagingStyle(you)
      .setGroupConversation(false)
      .addMessage(
        AndroidNotification.MessagingStyle.Message(
          wordsOf(content.text ?: "", sender.name),
          notification.originDate.time,
          from,
        ),
      )
    builder.setStyle(style)
    icon?.let { builder.setLargeIcon(it) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && farm != null && icon != null) {
      FarmConversations.shortcutFor(context, farm, content.title, from, icon)?.let {
        builder.setShortcutId(it)
      }
    }
    return builder.build()
  }

  /** The push's words after the friend's name, which the layout already shows ("Pip: hi"). */
  private fun wordsOf(text: String, name: String): String =
    text.removePrefix("$name: ").ifEmpty { text }

  /** The push's data: FCM's own map, or a local notification's `data` (development). */
  private fun pushData(notification: Notification): Map<String, String> {
    val trigger = notification.notificationRequest.trigger
    if (trigger is FirebaseNotificationTrigger) return trigger.remoteMessage.data
    val body = notification.notificationRequest.content.body ?: return emptyMap()
    return body.keys().asSequence().associateWith { body.optString(it) }
  }

  /** The farm a push is about: inside the push's JSON `body` from FCM, at the top otherwise. */
  private fun farmOf(data: Map<String, String>): String? {
    data["farm"]?.let { return it }
    val body = data["body"] ?: return null
    return try {
      JSONObject(body).optString("farm").takeIf { it.isNotEmpty() && it != "null" }
    } catch (e: Exception) {
      null
    }
  }

  private data class Sender(val person: String, val name: String)

  private fun senderOf(data: Map<String, String>): Sender? {
    val person = data["senderPerson"]?.takeIf { it.isNotEmpty() } ?: return null
    val name = data["senderName"]?.takeIf { it.isNotEmpty() } ?: return null
    return Sender(person, name)
  }

  private companion object {
    const val TAG = "KithfieldPush"
  }
}
