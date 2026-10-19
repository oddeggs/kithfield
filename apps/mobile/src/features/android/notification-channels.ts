import * as Notifications from 'expo-notifications';
import type { Translate } from '@kithfield/i18n';

/*
 * Android's notification channels (`14 Platforms`, 14-07), named in the person's language. The
 * server picks one for each push (`androidChannelOf` in the api): plans, the doorstep, mentions
 * and knocks in "Plans & doorstep"; every other message in "Every message", which the app's own
 * setting keeps off for most people; and the quiet "a few things" with no sound at all. People
 * can silence any of them in system settings. None shows a badge: nothing here is counted.
 */

export const ANDROID_CHANNELS = ['plans', 'messages', 'quiet'] as const;
export type AndroidChannelId = (typeof ANDROID_CHANNELS)[number];

export function channelFor(id: AndroidChannelId, t: Translate) {
  const base = { showBadge: false, enableVibrate: id !== 'quiet' };
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
    case 'quiet':
      return {
        ...base,
        name: t('android.channel.quiet.name'),
        description: t('android.channel.quiet.description'),
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
      };
  }
}

/** Makes or renames the channels; Android keeps each person's own choices for them. */
export async function setUpChannels(t: Translate): Promise<void> {
  for (const id of ANDROID_CHANNELS) {
    await Notifications.setNotificationChannelAsync(id, channelFor(id, t));
  }
}
