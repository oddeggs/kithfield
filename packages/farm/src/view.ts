import {
  type CareFamily,
  type DoorstepItem,
  type EpochMs,
  type FarmState,
  type LocalDate,
  type PersonId,
  type PlantId,
  type PlantStage,
  type RareVariant,
  type SeasonRef,
  type SeedState,
  type Weather,
} from '@kithfield/contracts';

import { aliasOf } from './aliases';
import { FAMILIES, SLEEPY_AFTER_DAYS, plantFor } from './catalog';
import { type PlanConditions, planConditions } from './plans';
import { CLOUD_MS, CRITTER_SLEEPY_DAYS, DAY_MS, FARM_MISTY_DAYS, STATUS_MS } from './rules';
import { canApplyRules } from './reducer';
import { farmDay, harvestDayOf, pendingSeason } from './seasons';
import { UnknownTimeZoneError, isBirthday, laterDay, localDay } from './time';

/*
 * The farm as drawn at a moment: everything time-based (sleepy, misty, today's season, birthdays)
 * is worked out here from the state's timestamps and `now`, never stored.
 */

export interface PlantView {
  readonly plant: PlantId;
  /** Null for the signature crop and the porch pot, which grow from every kind of care. */
  readonly family: CareFamily | null;
  readonly stage: PlantStage;
  readonly sleepy: boolean;
  readonly rare: RareVariant | null;
}

export interface CritterView {
  readonly person: PersonId;
  readonly sleepy: boolean;
  readonly hibernating: boolean;
  readonly paused: boolean;
  /** The status bubble, while it shows (24 hours). */
  readonly status: string | null;
  /** A rain cloud over the cottage, while it lasts (48 hours). */
  readonly cloud: boolean;
  readonly birthday: boolean;
}

export interface PlanView {
  readonly seed: SeedState;
  readonly conditions: PlanConditions;
  /** 0–3: one stage per condition met (seed, sprout, bud, bloom). */
  readonly stage: number;
}

export interface FarmView {
  readonly today: LocalDate;
  /**
   * The farm's season, as its plants are. It changes only when `season_rolled` is written; until
   * then `rollPending` says the calendar has moved on.
   */
  readonly season: SeasonRef;
  readonly rollPending: boolean;
  /**
   * This device's time zone data doesn't know the farm's zone: `today` is counted in UTC from the
   * farm's last known day. The app should update; days may be off by one meanwhile.
   */
  readonly timeZoneUnknown: boolean;
  readonly harvestDay: LocalDate;
  readonly isHarvestDay: boolean;
  /** No one has opened the farm for 14 days: mist, everyone dozing. */
  readonly misty: boolean;
  /** The farm runs rules newer than this app: draw it, but the app needs an update. */
  readonly rulesOutdated: boolean;
  /** This season's six family plants, then the signature crop. Empty on a visit. */
  readonly plants: readonly PlantView[];
  readonly pot: PlantView | null;
  readonly critters: readonly CritterView[];
  /** Today's weather, if any was recorded. */
  readonly weather: Weather | null;
  readonly sharedRain: boolean;
  /** Members whose rose blooms today, with who watered it and signed the card. */
  readonly roses: readonly { person: PersonId; waterers: PersonId[]; signers: PersonId[] }[];
  /** What waits on doorsteps now; slow posts until they're delivered. */
  readonly doorstep: readonly DoorstepItem[];
  readonly plans: readonly PlanView[];
}

const earliest = (times: readonly EpochMs[]): EpochMs | null =>
  times.length > 0 ? Math.min(...times) : null;

const latest = (times: readonly (EpochMs | null)[]): EpochMs | null =>
  times.reduce<EpochMs | null>((a, b) => (b === null ? a : a === null ? b : Math.max(a, b)), null);

const todayOf = (state: FarmState, now: EpochMs) => {
  try {
    return { today: farmDay(state, now), timeZoneUnknown: false };
  } catch (error) {
    if (!(error instanceof UnknownTimeZoneError)) throw error;
    return { today: laterDay(state.today.day, localDay(now, 'UTC')), timeZoneUnknown: true };
  }
};

/**
 * The farm as drawn at `now`. People are drawn as who they are now: an id merged into another
 * person reads as the kept one (`state.aliases`).
 */
export const farmView = (state: FarmState, now: EpochMs): FarmView => {
  const alias = (person: PersonId) => aliasOf(state, person);
  const { today, timeZoneUnknown } = todayOf(state, now);
  const season = state.season;
  const harvestDay = harvestDayOf(state, today);
  // Before anyone tends or opens anything, time counts from the earliest anyone joined.
  const since = earliest([
    ...state.members.map((m) => m.joinedAt),
    ...state.former.map((f) => f.joinedAt),
  ]);
  const sleepyAfter = SLEEPY_AFTER_DAYS[season.season] * DAY_MS;
  const asleep = (last: EpochMs | null, after: number) => {
    const from = last ?? since;
    return from === null || now - from > after;
  };
  const anyTend = latest(Object.values(state.familyTendedAt));
  const familyOf = (plant: string) =>
    FAMILIES.find((f) => plantFor(f, state.season.season) === plant) ?? null;
  const plants = state.plants.map((p): PlantView => {
    const family = familyOf(p.plant);
    const last = family ? state.familyTendedAt[family] : anyTend;
    return {
      plant: p.plant,
      family,
      stage: p.stage,
      sleepy: asleep(last ?? null, sleepyAfter),
      rare: p.rare,
    };
  });
  const pot = state.pot && {
    plant: state.pot.plant,
    family: null,
    stage: state.pot.stage,
    sleepy: asleep(anyTend, sleepyAfter),
    rare: null,
  };
  const critters = state.members.map((m): CritterView => {
    const paused = m.pausedUntil !== null && m.pausedUntil > now;
    // Opening the farm or a firefly left for them wakes a critter.
    const woken = latest([m.lastOpenedAt, m.lastWokenAt]) ?? m.joinedAt;
    const away = asleep(woken, CRITTER_SLEEPY_DAYS * DAY_MS);
    return {
      person: aliasOf(state, m.person),
      sleepy: away || m.hibernating || paused,
      hibernating: m.hibernating,
      paused,
      status: m.status && now - m.status.at < STATUS_MS ? m.status.text : null,
      cloud: m.cloudAt !== null && now - m.cloudAt < CLOUD_MS,
      birthday: state.birthdaysBloom && !!m.birthday && isBirthday(m.birthday, today),
    };
  });
  const opened = latest(state.members.map((m) => m.lastOpenedAt)) ?? since;
  const birthdays = new Set(critters.filter((c) => c.birthday).map((c) => c.person));
  const plans = state.seeds
    .filter((s) => !s.unsent)
    .map((seed): PlanView => {
      const conditions = planConditions(seed, state.members.length, today);
      const stage = [conditions.day, conditions.place, conditions.yeses].filter(Boolean).length;
      return { seed, conditions, stage };
    });
  return {
    today,
    season,
    harvestDay,
    rollPending: pendingSeason(state, today) !== null,
    timeZoneUnknown,
    isHarvestDay: today === harvestDay,
    misty: opened === null || now - opened > FARM_MISTY_DAYS * DAY_MS,
    rulesOutdated: !canApplyRules(state),
    plants,
    pot,
    critters,
    weather: state.weather?.day === today ? state.weather.weather : null,
    sharedRain: state.sharedRainDay === today,
    roses: [...birthdays].map((person) => {
      const rose = state.roses.find((r) => aliasOf(state, r.person) === person && r.day === today);
      return {
        person,
        waterers: [...new Set((rose?.waterers ?? []).map(alias))],
        signers: [...new Set((rose?.signers ?? []).map(alias))],
      };
    }),
    doorstep: state.doorstep
      .filter((d) => d.deliverAt === undefined || d.deliverAt > now)
      .map((d) => ({ ...d, from: alias(d.from), to: alias(d.to) })),
    plans,
  };
};
