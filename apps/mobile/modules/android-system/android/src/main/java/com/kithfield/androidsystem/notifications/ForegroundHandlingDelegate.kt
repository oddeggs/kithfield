package com.kithfield.androidsystem.notifications

import android.content.Context
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.RemoteNotificationContent
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.interfaces.HandlingDelegate

/**
 * Kithfield's pushes reach Android as data messages, which expo-notifications shows only while the
 * app is in the background: in the foreground it hands them to JavaScript, which leaves data
 * messages alone. This shows the ones with words (never a widget's silent redraw) either way.
 */
class ForegroundHandlingDelegate(
  private val context: Context,
  private val expo: HandlingDelegate,
) : HandlingDelegate by expo {
  override fun handleNotification(notification: Notification) {
    expo.handleNotification(notification)
    val content = notification.notificationRequest.content
    val hasWords = !(content.title.isNullOrEmpty() && content.text.isNullOrEmpty())
    if (isForeground() && content is RemoteNotificationContent && content.isDataOnly && hasWords) {
      NotificationsService.present(context, notification)
    }
  }

  private fun isForeground(): Boolean =
    ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
}
