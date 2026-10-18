import type { EnCatalogue } from './catalogue-types';

/**
 * Push notifications, from the notification catalogue in `10 On the System`. The push consumer
 * renders these in the person's language from a `PushJob`'s copy key and parameters. `{name}` is
 * a friend's display name, `{preview}` the message's short line, `{title}` a remember-me seed's
 * title. Pushes never count care, never ask "X is waiting for your reply", and never mention the fire
 * room starting.
 */
export const pushEn = {
  /** The title of a push that belongs to no one farm, such as a nudge. */
  'push.app': 'Kithfield',
  /** Stands in for a name the cottage doesn't know, such as a friend who left. */
  'push.aFriend': 'A friend',
  'push.doorstep.firefly': '{name} left a firefly on your step. No reply needed.',
  'push.doorstep.gift': '{name} left a gift on your step.',
  'push.doorstep.slowPost': 'A slow post from {name} arrived on your step. Best opened with tea.',
  /** Replaces the day's doorstep push once a second thing arrives. */
  'push.doorstep.few': 'A few things are on your step.',
  /** A mention or a reply: the friend's name and the message's own short line. */
  'push.mention': '{name}: {preview}',
  'push.joined': '{name} moved in. Wave hello?',
  'push.knock': '{name} is knocking on your porch.',
  /** Replaces the day's push for a farm once its budget is spent. */
  'push.farm.few': 'A few things on the farm.',
  'push.birthday': 'It’s {name}’s birthday. Their rose is blooming.',
  'push.rareBloom': 'A {bloom} opened on the farm.',
  /** A gentle nudge about a friend whose critter woke up. */
  'push.nudge.wave': '{name} just woke up from a long nap. A wave would make their day.',
  /** The last nudge before nudges rest until the person comes back on their own. */
  'push.nudge.last': 'I’ll stop knocking. The farm will wait.',
  /** A remember-me seed's nudge. The seed's title already names the friend. */
  'push.remember': 'You planted a seed: {title}. Maybe ask how it went?',
} as const satisfies EnCatalogue;
