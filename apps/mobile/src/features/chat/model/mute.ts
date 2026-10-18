import type { FarmNotifications } from '@kithfield/contracts';

/**
 * The notification settings that mute a chat (until turned back on) or unmute it, keeping what
 * knocks as it was. A failed read, a 404 for someone no longer on the farm included, is a failure.
 */
export async function muteSettings(
  read: () => Promise<Pick<FarmNotifications, 'knockFor'>>,
  muted: boolean,
): Promise<FarmNotifications> {
  const { knockFor } = await read();
  return { mutedUntil: muted ? 'always' : null, knockFor };
}
