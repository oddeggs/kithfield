import type { FarmCommand, TimeZone } from '@kithfield/contracts';
import { addDays, localDay, weekday } from '@kithfield/farm';

import { nextLocalHour, zonedInstant } from './calendar';

/* What a phone's command becomes in the log: the parts the farm adds itself. */

/**
 * Slow posts arrive at 07:00 the next morning, or 09:00 on the coming Saturday, in the friend's own
 * time zone once their app has sent it, else in the farm's.
 */
const MORNING_HOUR = 7;
const WEEKEND_HOUR = 9;
const SATURDAY = 6;

const deliverAt = (when: 'morning' | 'weekend', now: number, tz: TimeZone): number => {
  if (when === 'morning') return nextLocalHour(now, MORNING_HOUR, tz);
  let day = localDay(now, tz);
  for (;;) {
    const at = zonedInstant(day, WEEKEND_HOUR, tz);
    if (weekday(day) === SATURDAY && at > now) return at;
    day = addDays(day, 1);
  }
};

/** What a phone's command becomes in the log. */
export const payloadOf = (cmd: FarmCommand, now: number, tz: TimeZone): unknown => {
  if (cmd.kind === 'unsend') return { ...cmd.payload, by: 'author' };
  if (cmd.kind === 'removed') return { ...cmd.payload, by: 'keeper' };
  if (cmd.kind === 'left') return { how: 'left' };
  if (cmd.kind === 'slow_post') {
    return { ...cmd.payload, deliverAt: deliverAt(cmd.payload.when, now, tz) };
  }
  return cmd.payload;
};
