import { z } from 'zod';

import {
  ArtId,
  Critter,
  Departure,
  DisplayName,
  EpochMs,
  FarmId,
  FarmKind,
  FarmName,
  FarmPlace,
  Hemisphere,
  LIMITS,
  LocalDate,
  MonthDay,
  PersonId,
  PlantId,
  Role,
  Season,
  Seq,
  TimeZone,
  Weather,
  text,
} from '../primitives';

/* Presence */

/** Written by the farm from presence, at most once per person per hour. */
export const FarmOpenedPayload = z.object({});
export type FarmOpenedPayload = z.infer<typeof FarmOpenedPayload>;

/**
 * Hibernate pauses every nudge on every farm and tucks the critter in. A person hibernates once,
 * over HTTP; the server writes this event on every farm they live on.
 */
export const HibernatePayload = z.object({ on: z.boolean() });
export type HibernatePayload = z.infer<typeof HibernatePayload>;

/**
 * Things a critter shows above its cottage: a status bubble (40 characters, 24 hours), a rain cloud
 * for a rough day (clears after 48 hours), and the social battery (lamp on or resting).
 */
export const StatusPayload = z.discriminatedUnion('status', [
  z.object({ status: z.literal('words'), text: text(LIMITS.status).nullable() }),
  z.object({ status: z.literal('cloud'), raised: z.boolean() }),
  z.object({ status: z.literal('battery'), battery: z.enum(['open', 'resting']) }),
]);
export type StatusPayload = z.infer<typeof StatusPayload>;

export const FireCommandPayload = z.object({ state: z.enum(['lit', 'sat']) });
export type FireCommandPayload = z.infer<typeof FireCommandPayload>;

/**
 * The fire room: `lit` by whoever lights it, `sat` once per person per session (the Voices tend),
 * `out` written by the farm (null actor) 3 minutes after the last person leaves.
 */
export const FirePayload = z.object({ state: z.enum(['lit', 'sat', 'out']) });
export type FirePayload = z.infer<typeof FirePayload>;

/* Membership */

/**
 * The farm's identity, always seq 1, written by the farm. The time zone and hemisphere come from the
 * creator's device settings, never their location; they set day boundaries and seasons. Visits
 * have no name.
 */
export const FarmCreatedPayload = z
  .object({
    kind: FarmKind,
    name: FarmName.nullable(),
    land: ArtId,
    timeZone: TimeZone,
    hemisphere: Hemisphere,
  })
  .refine((p) => (p.kind === 'visit') === (p.name === null), {
    message: 'A farm has a name; a visit has none',
    path: ['name'],
  });
export type FarmCreatedPayload = z.infer<typeof FarmCreatedPayload>;

export const JoinedPayload = z.object({
  name: DisplayName,
  critter: Critter,
  via: z.enum(['created', 'invite', 'visit']),
});
export type JoinedPayload = z.infer<typeof JoinedPayload>;

export const LeftCommandPayload = z.object({});
export type LeftCommandPayload = z.infer<typeof LeftCommandPayload>;

/**
 * Leaving is quiet. `account_deleted` comes from account deletion: phones then tombstone everything
 * the actor wrote.
 */
export const LeftPayload = z.object({ how: Departure.exclude(['removed']) });
export type LeftPayload = z.infer<typeof LeftPayload>;

export const RemovedCommandPayload = z.object({
  person: PersonId,
  removeMedia: z.boolean(),
});
export type RemovedCommandPayload = z.infer<typeof RemovedCommandPayload>;

/** A keeper's removal, or the safety team's (then the actor is null). */
export const RemovedPayload = RemovedCommandPayload.extend({
  by: z.enum(['keeper', 'safety']),
});
export type RemovedPayload = z.infer<typeof RemovedPayload>;

/** A change to the actor's own critter, name or birthday (day and month, opt-in). */
export const CritterChangedPayload = z
  .object({
    critter: Critter.optional(),
    name: DisplayName.optional(),
    birthday: MonthDay.nullable().optional(),
  })
  .refine((p) => p.critter !== undefined || p.name !== undefined || p.birthday !== undefined, {
    message: 'Change at least one thing',
  });
export type CritterChangedPayload = z.infer<typeof CritterChangedPayload>;

const keeperSettings = [
  z.object({ setting: z.literal('name'), name: FarmName }),
  z.object({ setting: z.literal('land'), land: ArtId }),
  /** The day boundaries and seasons; from device settings, never location. */
  z.object({ setting: z.literal('calendar'), timeZone: TimeZone, hemisphere: Hemisphere }),
  /** The keeper's town, for weather; null stops the weather. */
  z.object({ setting: z.literal('place'), place: FarmPlace.nullable() }),
  z.object({ setting: z.literal('birthdays'), on: z.boolean() }),
  z.object({ setting: z.literal('approval'), on: z.boolean() }),
  z.object({ setting: z.literal('theme'), theme: ArtId.nullable() }),
  z.object({ setting: z.literal('role'), person: PersonId, role: Role }),
] as const;

/** A setting a keeper changes. Phones can't send `frozen` or `paused`. */
export const SettingsCommandPayload = z.discriminatedUnion('setting', [...keeperSettings]);
export type SettingsCommandPayload = z.infer<typeof SettingsCommandPayload>;

/**
 * One farm setting changed. `frozen` and `paused` are written by the safety team with a null
 * actor; a pause lets the person read but not post, and their critter naps until `until`.
 */
export const SettingsChangedPayload = z.discriminatedUnion('setting', [
  ...keeperSettings,
  z.object({ setting: z.literal('frozen'), on: z.boolean() }),
  z.object({ setting: z.literal('paused'), person: PersonId, until: EpochMs.nullable() }),
]);
export type SettingsChangedPayload = z.infer<typeof SettingsChangedPayload>;

/* Written by the farm */

/** Where the weather came from; each source has its own attribution. Grows with new sources. */
export const WeatherSource = z.enum(['weatherkit']);
export type WeatherSource = z.infer<typeof WeatherSource>;

export const WeatherPayload = z.object({
  day: LocalDate,
  weather: Weather,
  source: WeatherSource,
});
export type WeatherPayload = z.infer<typeof WeatherPayload>;

/** 3+ members opened the farm within 10 minutes; at most once a day. */
export const SharedRainPayload = z.object({
  day: LocalDate,
  people: z.array(PersonId).min(3).max(LIMITS.members),
});
export type SharedRainPayload = z.infer<typeof SharedRainPayload>;

/** `year` is the year the season starts in (winter 2026 runs into 2027). */
export const SeasonRef = z.object({
  season: Season,
  year: z.int().min(2026).max(9999),
});
export type SeasonRef = z.infer<typeof SeasonRef>;

export const SeasonRolledPayload = SeasonRef;
export type SeasonRolledPayload = z.infer<typeof SeasonRolledPayload>;

/** Harvest day: the reducer puts every plant that bloomed this season into the basket. */
export const HarvestedPayload = SeasonRef.extend({ day: LocalDate });
export type HarvestedPayload = z.infer<typeof HarvestedPayload>;

export const RulesChangedPayload = z
  .object({ from: z.int().min(1), to: z.int().min(1) })
  .refine((p) => p.to > p.from, { message: 'Rules only move forward' });
export type RulesChangedPayload = z.infer<typeof RulesChangedPayload>;

/**
 * A swap made while visiting another farm: one bundle for one, once per visit. Written by the farm
 * on both farms, each with its own trader as actor; `with` is the person on the other farm.
 */
export const TradedPayload = z.object({
  with: PersonId,
  otherFarm: FarmId,
  gave: PlantId.nullable(),
  got: PlantId,
});
export type TradedPayload = z.infer<typeof TradedPayload>;

/**
 * An appeal undid a removal: the farm put the target's payload back in its log. Phones refetch
 * that event by paging (`after = target - 1`, `limit = 1`).
 */
export const RestoredPayload = z.object({ target: Seq });
export type RestoredPayload = z.infer<typeof RestoredPayload>;
