import * as Notifications from 'expo-notifications';
import type { Translate } from '@kithfield/i18n';

/*
 * Android's two notification channels (`14 Platforms`), named in the person's language. The
 * server picks one for each push (`androidChannelOf` in the api): plans, the doorstep, mentions
 * and knocks in "Plans & doorstep"; every other message in "Every message", which the app's own
 * setting keeps off for most people. The quiet "a few things" roundup arrives in the first, drawn
 * without a sound. People can silence either in system settings. Neither shows a badge: nothing
 * here is counted.
 */

export const ANDROID_CHANNELS = ['plans', 'messages'] as const;
export type AndroidChannelId = (typeof ANDROID_CHANNELS)[number];

/** Channels earlier builds made, taken away so system settings lists only the two. */
export const RETIRED_CHANNELS = ['quiet'] as const;

export function channelFor(id: AndroidChannelId, t: Translate) {
  const base = { showBadge: false, enableVibrate: true };
  switch (id) {
    case 'plans':
      return {
        ...base,
        name: t('android.channel.plans.name'),
        description: t('android.channel.plans.description'),
        importance: Notifications.AndroidImportance.HIGH,
      };
    case 'messages':
      return {
        ...base,
        name: t('android.channel.messages.name'),
        description: t('android.channel.messages.description'),
        importance: Notifications.AndroidImportance.DEFAULT,
      };
  }
}

/** Makes or renames the channels; Android keeps each person's own choices for them. */
export async function setUpChannels(t: Translate): Promise<void> {
  for (const id of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(id, channelFor(id, t));
  }
  for (const id of RETIRED_CHANNELS) {
    await Notifications.deleteNotificationChannelAsync(id);
  }
}
