package com.kithfield.androidsystem.notifications

import android.content.Context
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoHandlingDelegate
import expo.modules.notifications.service.interfaces.HandlingDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate

/**
 * expo-notifications' dispatcher with Kithfield's two changes (`14 Platforms`): a push from a
 * friend is drawn as their message, with their critter, and a push that arrives while the app is
 * open is still shown. It takes the place of the library's own receiver in the manifest.
 */
class KithfieldNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    ConversationPresentationDelegate(context)

  override fun getHandlingDelegate(context: Context): HandlingDelegate =
    ForegroundHandlingDelegate(context, ExpoHandlingDelegate(context))
}
