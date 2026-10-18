import { z } from 'zod';

import {
  ArtId,
  Critter,
  DisplayName,
  FarmId,
  FarmName,
  FarmPlace,
  LIMITS,
  LocalDate,
  MonthDay,
  PersonId,
  PlantId,
  Role,
  Season,
  Weather,
  text,
} from '../primitives';

/* Presence */

/** Written by the farm from presence, at most once per person per hour. */
export const FarmOpenedPayload = z.strictObject({});
export type FarmOpenedPayload = z.infer<typeof FarmOpenedPayload>;

/** Hibernate pauses every nudge on every farm and tucks the critter in (11-01). */
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
 * `out` written by the farm 3 minutes after the last person leaves.
 */
export const FirePayload = z.object({ state: z.enum(['lit', 'sat', 'out']) });
export type FirePayload = z.infer<typeof FirePayload>;

/* Membership */

export const JoinedPayload = z.object({
  name: DisplayName,
  critter: Critter,
  via: z.enum(['created', 'invite', 'visit']),
});
export type JoinedPayload = z.infer<typeof JoinedPayload>;

export const LeftCommandPayload = z.strictObject({});
export type LeftCommandPayload = z.infer<typeof LeftCommandPayload>;

/**
 * Leaving is quiet. `account_deleted` comes from account deletion: phones then tombstone everything
 * the actor wrote.
 */
export const LeftPayload = z.object({ how: z.enum(['quietly', 'account_deleted']) });
export type LeftPayload = z.infer<typeof LeftPayload>;

export const RemovedCommandPayload = z.object({
  person: PersonId,
  removeMedia: z.boolean(),
});
export type RemovedCommandPayload = z.infer<typeof RemovedCommandPayload>;

/** A keeper's removal, or the safety team's (then the actor is the farm). */
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

/** One farm setting changed. Keepers only, except `frozen`, which the safety team sets. */
export const SettingsChangedPayload = z.discriminatedUnion('setting', [
  z.object({ setting: z.literal('name'), name: FarmName }),
  z.object({ setting: z.literal('land'), land: ArtId }),
  z.object({ setting: z.literal('place'), place: FarmPlace }),
  z.object({ setting: z.literal('birthdays'), on: z.boolean() }),
  z.object({ setting: z.literal('approval'), on: z.boolean() }),
  z.object({ setting: z.literal('theme'), theme: ArtId.nullable() }),
  z.object({ setting: z.literal('role'), person: PersonId, role: Role }),
  z.object({ setting: z.literal('frozen'), on: z.boolean() }),
]);
export type SettingsChangedPayload = z.infer<typeof SettingsChangedPayload>;

/* Written by the farm */

export const WeatherPayload = z.object({
  day: LocalDate,
  weather: Weather,
  source: z.enum(['weatherkit']),
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

/** A swap made while visiting another farm (15-06): one bundle for one, written on both farms. */
export const TradedPayload = z.object({
  with: PersonId,
  otherFarm: FarmId,
  gave: PlantId.nullable(),
  got: PlantId,
});
export type TradedPayload = z.infer<typeof TradedPayload>;
