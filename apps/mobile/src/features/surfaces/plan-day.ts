import type {
  FarmId,
  FarmState,
  PersonId,
  PlanDayActivity,
  SeedState,
  SurfacePerson,
} from '@kithfield/contracts';
import { localDay, planDay, startOfDay } from '@kithfield/farm';

import { surfaceLink } from './links';
import { imageNames } from './names';

/*
 * The plan's day on the Lock Screen and in the Dynamic Island: from 2 hours before a sprouted
 * plan to 2 hours after, for someone going. Who's there (checked in) and who's on the way (said
 * they're in) step along as it changes. The server starts and moves the same activity by push
 * (`apps/api/src/surfaces/live-activity.ts`), under the same key and the same window.
 */

const HOUR = 60 * 60_000;
/** The activity runs this long either side of the plan's start. */
export const PLAN_DAY_MARGIN = 2 * HOUR;
/** A plan without a start time runs through the day. */
const ALL_DAY = { from: 9 * 60, to: 21 * 60 } as const;

/** The activity's key: the same as the server's. */
export const planDayKey = (farm: FarmId, seed: number) => `${farm}:${seed}`;

const minutesOf = (time: string) => {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
};

/** When a plan's activity shows, in epoch ms; null for a plan without a day. */
export function planDayWindow(
  seed: SeedState,
  timeZone: string,
): { start: number; from: number; to: number } | null {
  const day = planDay(seed);
  if (day === null) return null;
  const midnight = startOfDay(day, timeZone);
  const time = seed.days.find((d) => d.date === day)?.from;
  if (time === undefined) {
    return {
      start: midnight + ALL_DAY.from * 60_000,
      from: midnight + ALL_DAY.from * 60_000,
      to: midnight + ALL_DAY.to * 60_000,
    };
  }
  const start = midnight + minutesOf(time) * 60_000;
  return { start, from: start - PLAN_DAY_MARGIN, to: start + PLAN_DAY_MARGIN };
}

/** Those going: everyone who said they're in, and the planter unless they answered otherwise. */
export function goingTo(seed: SeedState): PersonId[] {
  const going = seed.rsvps.filter((r) => r.answer === 'in').map((r) => r.person);
  const planterAnswered = seed.rsvps.some((r) => r.person === seed.planter);
  if (!planterAnswered && !going.includes(seed.planter)) going.unshift(seed.planter);
  return going;
}

export interface PlanDayInput {
  readonly farm: FarmId;
  readonly state: FarmState;
}

export interface WantedActivity {
  readonly key: string;
  readonly attributes: PlanDayActivity['attributes'];
  readonly state: PlanDayActivity['state'];
}

/** The plan-day activities this phone should show at `now`. `you` is the person's own name. */
export function planDayActivities(
  farms: readonly PlanDayInput[],
  me: PersonId,
  now: number,
  you: string,
  scheme: string,
): WantedActivity[] {
  const wanted: WantedActivity[] = [];
  for (const { farm, state } of farms) {
    const names = new Map(state.members.map((m) => [m.person, m.name]));
    const who = (id: PersonId): SurfacePerson => ({
      person: id,
      name: id === me ? you : (names.get(id) ?? null),
      image: imageNames.critter(id),
    });
    for (const seed of state.seeds) {
      if (seed.sproutedAt === null || seed.someday || seed.title === null) continue;
      const window = planDayWindow(seed, state.timeZone);
      if (window === null || now < window.from || now > window.to) continue;
      const going = goingTo(seed);
      if (!going.includes(me) && !seed.checkins.includes(me)) continue;
      const day = planDay(seed) ?? localDay(now, state.timeZone);
      wanted.push({
        key: planDayKey(farm, seed.seq),
        attributes: {
          farm,
          seed: seed.seq,
          title: seed.title,
          place: seed.place?.name ?? null,
          date: day,
          from: seed.days.find((d) => d.date === day)?.from ?? null,
          link: surfaceLink(scheme, { to: 'plan', farm, seed: seed.seq }),
        },
        state: {
          here: seed.checkins.map(who),
          onTheWay: going.filter((p) => !seed.checkins.includes(p)).map(who),
        },
      });
    }
  }
  return wanted;
}

export interface RunningPlanDay {
  readonly id: string;
  readonly key: string;
  readonly stateJson: string;
}

export interface PlanDayChanges {
  readonly start: readonly WantedActivity[];
  readonly update: readonly { readonly id: string; readonly stateJson: string }[];
  readonly end: readonly string[];
}

/** What to start, move along and end so the running activities are the wanted ones. */
export function planDayChanges(
  wanted: readonly WantedActivity[],
  running: readonly RunningPlanDay[],
): PlanDayChanges {
  const byKey = new Map(running.map((r) => [r.key, r]));
  const start: WantedActivity[] = [];
  const update: { id: string; stateJson: string }[] = [];
  for (const w of wanted) {
    const current = byKey.get(w.key);
    const stateJson = JSON.stringify(w.state);
    if (current === undefined) start.push(w);
    else if (current.stateJson !== stateJson) update.push({ id: current.id, stateJson });
  }
  const keys = new Set(wanted.map((w) => w.key));
  const end = running.filter((r) => !keys.has(r.key)).map((r) => r.id);
  return { start, update, end };
}

/** The next moment the wanted set can change by the clock alone: a window opening or closing. */
export function nextPlanDayChange(farms: readonly PlanDayInput[], now: number): number | null {
  let next: number | null = null;
  for (const { state } of farms) {
    for (const seed of state.seeds) {
      if (seed.sproutedAt === null) continue;
      const window = planDayWindow(seed, state.timeZone);
      if (window === null) continue;
      for (const at of [window.from, window.to + 1]) {
        if (at > now && (next === null || at < next)) next = at;
      }
    }
  }
  // Never wait past tomorrow: a plan sprouting meanwhile arrives as farm activity anyway.
  return next === null ? null : Math.min(next, now + 24 * HOUR);
}
