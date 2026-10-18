import { nextHeldAt, releaseHeld } from './claim';
import { considerJob, type Intake, reminderJob } from './intake';
import { nextActivityAt, ringActivities } from './live-activities';
import * as seeds from './seeds';
import * as sockets from './socket';

/**
 * What the cottage's alarm does: send on held pushes once quiet hours end, nudge remember-me
 * seeds that are due, and start or end plans' days. False when something failed: what wasn't
 * handled stays held or planted.
 */
export async function ringAlarm(intake: Intake): Promise<boolean> {
  try {
    await releaseHeld(intake);
    for (const seed of seeds.dueSeeds(intake.sql, intake.now)) {
      await considerJob(intake, reminderJob(intake.person, seed, intake.now), false);
      seeds.removeSeed(intake.sql, seed.id);
    }
    await ringActivities(intake);
    return true;
  } catch (error) {
    console.error('cottage alarm failed', { error: String(error) });
    return false;
  }
}

/** The earliest thing due (a held push, a seed, a hello deadline, a plan's day), or null. */
export function nextAlarmAt(sql: SqlStorage, open: readonly WebSocket[]): number | null {
  const times = [
    nextHeldAt(sql),
    seeds.nextSeedAt(sql),
    sockets.nextDeadline(open),
    nextActivityAt(sql),
  ].filter((t) => t !== null);
  return times.length === 0 ? null : Math.min(...times);
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * How long from now until `at`, by the cottage's clock. A far-off time rings within a year and
 * reschedules, since alarms take no date past 2189.
 */
export function alarmDelay(at: number, now: number): number {
  return Math.min(Math.max(at - now, 0), YEAR_MS);
}
