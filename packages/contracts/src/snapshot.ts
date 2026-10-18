import { z } from 'zod';

import { AnyEventKind, RulesVersion } from './events';
import { DayOption, Yeses } from './payloads/care';
import { Crop, SeasonRef } from './payloads/farm';
import {
  ArtId,
  CareFamily,
  Critter,
  Departure,
  DisplayName,
  EpochMs,
  FarmId,
  FarmKind,
  FarmName,
  FarmPlace,
  Hemisphere,
  Id,
  LIMITS,
  LocalDate,
  MonthDay,
  PersonId,
  Place,
  PlantId,
  PlantStage,
  RareVariant,
  Role,
  Seq,
  TimeZone,
  Weather,
  text,
} from './primitives';

const people = z.array(PersonId).max(LIMITS.members);

/**
 * Who helped a plant and with which kinds of care. Credits name people and kinds, never totals.
 * Kinds are open, so a newer credited kind doesn't break an older app's snapshot.
 */
export const Credit = z.object({
  person: PersonId,
  kinds: z
    .array(AnyEventKind)
    .max(40)
    .refine((kinds) => new Set(kinds).size === kinds.length, { message: 'Each kind once' }),
});
export type Credit = z.infer<typeof Credit>;

export const PlantState = z.object({
  plant: PlantId,
  /** Only ever rises within a season. */
  stage: PlantStage,
  /** Growth this season, for the shared reducer only. Never drawn as a number. */
  dew: z.int().min(0),
  rare: RareVariant.nullable(),
  /**
   * The farm day of its one rare roll this season: the first weather or shared-rain day on or
   * after it bloomed. Shared rain later that same day may roll again; after that day the variant
   * is fixed for the season.
   */
  rareRolledOn: LocalDate.nullable(),
  bloomedAt: EpochMs.nullable(),
  credits: z.array(Credit).max(LIMITS.members),
});
export type PlantState = z.infer<typeof PlantState>;

export const MemberState = z.object({
  person: PersonId,
  /** Null when their `joined` arrived as a tombstone (a removed name, or a deleted account). */
  name: DisplayName.nullable(),
  critter: Critter,
  role: Role,
  joinedAt: EpochMs,
  /** Sleepy and awake are computed from these and "now", never stored. */
  lastOpenedAt: EpochMs.nullable(),
  /**
   * The latest thing that woke their critter other than opening the farm, such as opening a
   * firefly left for them. Sleepiness reads the later of this and `lastOpenedAt`; shared rain
   * reads only `lastOpenedAt`.
   */
  lastWokenAt: EpochMs.nullable(),
  lastTendedAt: EpochMs.nullable(),
  hibernating: z.boolean(),
  /** Paused by the safety team until then: the critter naps and can't post. Compare with now. */
  pausedUntil: EpochMs.nullable(),
  /** Tended at least once this season: sets the growth scaling. */
  activeThisSeason: z.boolean(),
  birthday: MonthDay.nullable(),
  /** The status bubble and the `status` event that set it, so an unsend clears the right one. */
  status: z.object({ text: text(LIMITS.status), at: EpochMs, seq: Seq }).nullable(),
  cloudAt: EpochMs.nullable(),
  battery: z.enum(['open', 'resting']),
});
export type MemberState = z.infer<typeof MemberState>;

/** A cottage left behind: dozing, then a sketch. A deleted account leaves no name. */
export const FormerMember = z.object({
  person: PersonId,
  name: DisplayName.nullable(),
  critter: Critter,
  /** With the members' `joinedAt`, the earliest one is where the farm's sleepiness starts. */
  joinedAt: EpochMs,
  leftAt: EpochMs,
  how: Departure,
});
export type FormerMember = z.infer<typeof FormerMember>;

/**
 * A plan seed. `unsent` is true when its planting was unsent or removed (perhaps before this
 * device saw it): its content is gone (no title, no place), and it is never drawn.
 */
export const SeedState = z
  .object({
    seq: Seq,
    planter: PersonId,
    unsent: z.boolean(),
    title: text(80).nullable(),
    days: z.array(DayOption).max(14),
    place: Place.nullable(),
    yeses: Yeses,
    someday: z.boolean(),
    hat: PersonId,
    settleOn: LocalDate.nullable(),
    votes: z.array(z.object({ option: z.int().min(0).max(13), people })).max(14),
    rsvps: z
      .array(z.object({ person: PersonId, answer: z.enum(['in', 'maybe', 'out']) }))
      .max(LIMITS.members),
    checkins: people,
    sproutedAt: EpochMs.nullable(),
  })
  .refine((s) => s.unsent === (s.title === null) && (!s.unsent || s.place === null), {
    message: 'An unsent seed has no title or place; a live one has a title',
  });
export type SeedState = z.infer<typeof SeedState>;

export const FieldGuidePage = z.object({
  plant: PlantId,
  variant: RareVariant.nullable(),
  season: SeasonRef,
  foundAt: EpochMs,
  via: z.enum(['grown', 'traded']),
});
export type FieldGuidePage = z.infer<typeof FieldGuidePage>;

/**
 * Something addressed to a person that waits on their doorstep: a firefly or gift not yet opened,
 * or a slow post not yet delivered (`deliverAt`). `gift` is the gift's id, present exactly for
 * gifts, so `gift {action: 'opened'}` finds it. `visitor` is set when it came through the gate
 * from another farm (`from` is then the visitor).
 */
export const DoorstepItem = z
  .object({
    seq: Seq,
    kind: z.enum(['firefly', 'gift', 'slow_post']),
    from: PersonId,
    to: PersonId,
    deliverAt: EpochMs.optional(),
    gift: Id.optional(),
    visitor: z.object({ name: DisplayName, critter: Critter }).optional(),
  })
  .refine((d) => (d.kind === 'gift') === (d.gift !== undefined), {
    message: 'A gift id goes with a gift, and only a gift',
    path: ['gift'],
  });
export type DoorstepItem = z.infer<typeof DoorstepItem>;

/** A visit's porch pot: one plant a season from both people's care, and its own scrapbook. */
export const PorchPot = PlantState.extend({
  pressed: z.array(z.object({ season: SeasonRef, plant: PlantId, pressedAt: EpochMs })).max(400),
});
export type PorchPot = z.infer<typeof PorchPot>;

/**
 * The farm as the reducer leaves it: everything a phone or widget needs to draw the farm and keep
 * applying events. Visits have a pot and no field.
 */
export const FarmState = z.object({
  farm: FarmId,
  kind: FarmKind,
  /** Null for a visit. */
  name: FarmName.nullable(),
  land: ArtId,
  theme: ArtId.nullable(),
  /** Day boundaries and seasons. */
  timeZone: TimeZone,
  hemisphere: Hemisphere,
  /** The keeper's town, for weather only. */
  place: FarmPlace.nullable(),
  birthdaysBloom: z.boolean(),
  approval: z.boolean(),
  frozen: z.boolean(),
  rulesVersion: RulesVersion,
  season: SeasonRef,
  weather: z.object({ day: LocalDate, weather: Weather }).nullable(),
  sharedRainDay: LocalDate.nullable(),
  members: z.array(MemberState).max(LIMITS.members),
  former: z.array(FormerMember).max(500),
  /** This season's six family plants, then the signature crop. Empty on a visit. */
  plants: z.array(PlantState).max(7),
  /** Which entry of `plants` is the farm's signature crop. */
  signature: PlantId.nullable(),
  /** The latest tend of each family, for plant sleepiness. */
  familyTendedAt: z.record(CareFamily, EpochMs.nullable()),
  /** Dew each person gave each plant today (farm time), for the 3-a-day cap. Reducer input only. */
  today: z.object({
    day: LocalDate,
    given: z
      .array(z.object({ person: PersonId, plant: PlantId, dew: z.int().min(1).max(3) }))
      .max(LIMITS.members * 8),
  }),
  roses: z
    .array(z.object({ person: PersonId, day: LocalDate, waterers: people, signers: people }))
    .max(LIMITS.members),
  pot: PorchPot.nullable(),
  fieldGuide: z.array(FieldGuidePage).max(1000),
  basket: z.object({ season: SeasonRef, crops: z.array(Crop).max(8) }).nullable(),
  seeds: z.array(SeedState).max(100),
  pins: z.array(Seq).max(LIMITS.pins),
  /**
   * People merged away, mapped to who they are now (merged-away id → kept id). Past events keep
   * their old actor; phones draw them as the kept person and the reducer maps actors through this
   * before applying. Written into the snapshot after a `person_merged` job reaches the farm.
   */
  aliases: z
    .record(PersonId, PersonId)
    .refine((a) => Object.keys(a).length <= 500, { message: 'At most 500 aliases' })
    .refine((a) => Object.entries(a).every(([from, into]) => from !== into && !(into in a)), {
      message: 'An alias points at a kept person, never at itself or another alias',
    }),
  doorstep: z.array(DoorstepItem).max(500),
  fireLitAt: EpochMs.nullable(),
});
export type FarmState = z.infer<typeof FarmState>;

/** The compact snapshot a farm keeps, and the body of the `snapshot` frame. */
export const Snapshot = z.object({ seq: Seq, state: FarmState });
export type Snapshot = z.infer<typeof Snapshot>;
