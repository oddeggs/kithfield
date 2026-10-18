import type { EnvironmentName } from '../env';
import type {
  FarmState,
  FireActivity,
  PlanDayActivity,
  SeedState,
  SurfacePerson,
} from '@kithfield/contracts';
import { planDay } from '@kithfield/farm';

import { tag } from '../push/catalogue';
import { localClock, MINUTE_MS } from '../push/policy';

/*
 * What the server puts in a Live Activity push. The activity's type on the phone keeps its
 * attributes and state as JSON strings (`SurfaceAttributes {kind, key, json}` and
 * `ContentState {json}`), so the payload carries the contract's shapes stringified.
 */

/** A plan's day runs from 2 hours before it starts to 2 hours after. */
export const PLAN_DAY_LEAD_MS = 2 * 60 * MINUTE_MS;
/** A plan with no start time is followed through the day, from 9 till 5. */
const ALL_DAY = { from: '09:00', to: '17:00' } as const;
/** iOS ends a Live Activity after 8 hours: no window is longer. */
export const PLAN_DAY_MAX_MS = 8 * 60 * MINUTE_MS;

/**
 * The still the app renders of each person's critter into the App Group, by name. The app writes
 * the same names, so a server-made state draws without the app running.
 */
export const critterImageOf = (person: string) => `critter-${tag(person)}.png`;

/** The app's link scheme in each environment. */
const SCHEME: Readonly<Record<EnvironmentName, string>> = {
  dev: 'kithfield-dev',
  prd: 'kithfield',
};

/** Opens the plan: the Seed bed's plan screen. */
export const planLink = (env: EnvironmentName, farm: string, seed: number) =>
  `${SCHEME[env]}://seedbed/${seed}?farm=${encodeURIComponent(farm)}`;

/** Epoch ms of a wall-clock time on a date in a zone (the later one when a clock change repeats it). */
export function zonedTime(date: string, time: string, zone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wanted = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  let at = wanted;
  // Two passes settle the zone's offset, also across a clock change.
  for (let pass = 0; pass < 2; pass += 1) {
    const clock = localClock(at, zone);
    const [ly, lm, ld] = clock.date.split('-').map(Number);
    const local = Date.UTC(ly ?? 1970, (lm ?? 1) - 1, ld ?? 1) + clock.minutes * MINUTE_MS;
    at += wanted - local;
  }
  return at;
}

/** A sprouted plan's start time on its day, if it was given one. */
function startTimeOf(seed: SeedState, day: string): string | null {
  return seed.days.find((option) => option.date === day)?.from ?? null;
}

export interface PlanDayWindow {
  readonly day: string;
  readonly from: string | null;
  readonly startAt: number;
  readonly endAt: number;
}

/** When a sprouted plan's activity starts and ends, or null when it has no day yet. */
export function planDayWindow(state: FarmState, seed: SeedState): PlanDayWindow | null {
  if (seed.unsent || seed.sproutedAt === null || seed.someday) return null;
  const day = planDay(seed);
  if (day === null) return null;
  const from = startTimeOf(seed, day);
  if (from === null) {
    const startAt = zonedTime(day, ALL_DAY.from, state.timeZone);
    const endAt = zonedTime(day, ALL_DAY.to, state.timeZone);
    return { day, from, startAt, endAt: Math.min(endAt, startAt + PLAN_DAY_MAX_MS) };
  }
  const start = zonedTime(day, from, state.timeZone);
  const startAt = start - PLAN_DAY_LEAD_MS;
  return {
    day,
    from,
    startAt,
    endAt: Math.min(start + PLAN_DAY_LEAD_MS, startAt + PLAN_DAY_MAX_MS),
  };
}

/** Whether the person said they're in (or planted it, and didn't say they're out). */
export function goingTo(seed: SeedState, person: string): boolean {
  const answer = seed.rsvps.find((r) => r.person === person)?.answer;
  return answer === 'in' || (answer === undefined && seed.planter === person);
}

function personOf(state: FarmState, person: string): SurfacePerson {
  const member = state.members.find((m) => m.person === person);
  return { person, name: member?.name ?? null, image: critterImageOf(person) };
}

/** Who is there (checked in) and who is on their way (said they're in), members only. */
export function planDayState(state: FarmState, seed: SeedState): PlanDayActivity['state'] {
  const members = new Set(state.members.map((m) => m.person));
  const here = seed.checkins.filter((p) => members.has(p));
  const onTheWay = state.members
    .map((m) => m.person)
    .filter((p) => !here.includes(p) && goingTo(seed, p));
  return {
    here: here.map((p) => personOf(state, p)),
    onTheWay: onTheWay.map((p) => personOf(state, p)),
  };
}

export function planDayAttributes(
  env: EnvironmentName,
  state: FarmState,
  seed: SeedState,
  window: PlanDayWindow,
): PlanDayActivity['attributes'] {
  return {
    farm: state.farm,
    seed: seed.seq,
    title: seed.title ?? '',
    place: seed.place?.name ?? null,
    date: window.day,
    from: window.from,
    link: planLink(env, state.farm, seed.seq),
  };
}

/** The activity's key on the phone: what it follows (`SurfaceAttributes.key`). */
export const planDayKey = (farm: string, seed: number) => `${farm}:${seed}`;

const seconds = (ms: number) => Math.floor(ms / 1000);

/** Moves a running activity to a new state. */
export function updatePayload(state: unknown, now: number) {
  return {
    aps: {
      timestamp: seconds(now),
      event: 'update',
      'content-state': { json: JSON.stringify(state) },
    },
  };
}

/** Ends an activity, showing a last state until it is dismissed (now, or at `dismissAt`). */
export function endPayload(state: unknown, now: number, dismissAt = now) {
  return {
    aps: {
      timestamp: seconds(now),
      event: 'end',
      'content-state': { json: JSON.stringify(state) },
      'dismissal-date': seconds(dismissAt),
    },
  };
}

/** Starts the plan's day on a phone (push-to-start): iOS shows the alert with it. */
export function startPayload(
  attributes: PlanDayActivity['attributes'],
  state: PlanDayActivity['state'],
  alert: { title: string; body: string },
  now: number,
  endAt: number,
) {
  return {
    aps: {
      timestamp: seconds(now),
      event: 'start',
      'content-state': { json: JSON.stringify(state) },
      'attributes-type': 'SurfaceAttributes',
      attributes: {
        kind: 'plan_day',
        key: planDayKey(attributes.farm, attributes.seed),
        json: JSON.stringify(attributes),
      },
      // Quiet: it shows on the Lock Screen without a sound.
      alert,
      'stale-date': seconds(endAt),
    },
  };
}

/** The fire's last state: nobody by it. */
export const FIRE_OUT: FireActivity['state'] = {
  people: [],
  talking: null,
  muted: false,
  listening: false,
};
