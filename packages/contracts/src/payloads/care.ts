import { z } from 'zod';

import {
  ArtId,
  EpochMs,
  Id,
  LIMITS,
  LocalDate,
  LocalTime,
  PersonId,
  Place,
  PlantId,
  Seq,
  text,
} from '../primitives';

/* Gestures */

/** A dewdrop on a message (`target`), for a person (`to`; on their birthday it waters the rose), or the farm. */
export const DewdropPayload = z.object({
  target: Seq.optional(),
  to: PersonId.optional(),
});
export type DewdropPayload = z.infer<typeof DewdropPayload>;

/** A firefly waits on a doorstep until its person opens it; opening one wakes their critter. */
export const FireflyPayload = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('left'),
    to: PersonId,
    words: text(LIMITS.fireflyWords).optional(),
  }),
  z.object({ action: z.literal('opened'), target: Seq }),
]);
export type FireflyPayload = z.infer<typeof FireflyPayload>;

export const WavePayload = z.object({ to: PersonId.optional() });
export type WavePayload = z.infer<typeof WavePayload>;

/** Wobbles the friend's widget window. One per friend per day is a rule. */
export const KnockPayload = z.object({ to: PersonId });
export type KnockPayload = z.infer<typeof KnockPayload>;

/** A hug, or an umbrella brought to someone under a rain cloud (05-07). */
export const HugPayload = z.object({
  to: PersonId.optional(),
  umbrella: z.boolean().optional(),
});
export type HugPayload = z.infer<typeof HugPayload>;

/** A note marked "no reply needed". */
export const QuietNotePayload = z.object({ text: text(LIMITS.message) });
export type QuietNotePayload = z.infer<typeof QuietNotePayload>;

export const SlowPostCommandPayload = z.object({
  to: PersonId,
  text: text(LIMITS.message),
});
export type SlowPostCommandPayload = z.infer<typeof SlowPostCommandPayload>;

/** The farm sets `deliverAt` to the friend's next morning in their time zone (05-05). */
export const SlowPostPayload = SlowPostCommandPayload.extend({ deliverAt: EpochMs });
export type SlowPostPayload = z.infer<typeof SlowPostPayload>;

/* Plans */

export const DayOption = z.object({
  date: LocalDate,
  from: LocalTime.optional(),
});
export type DayOption = z.infer<typeof DayOption>;

/** How many yeses a plan needs to sprout (06-01). */
export const Yeses = z.enum(['couple', 'most', 'everyone']);
export type Yeses = z.infer<typeof Yeses>;

const planFields = {
  title: text(80),
  days: z.array(DayOption).max(14),
  place: Place.nullable(),
  yeses: Yeses,
  /** Resting in the shed: "someday" (06-04). */
  someday: z.boolean(),
};

/**
 * A plan seed, or a remember-me seed (06-05), which is only for its planter: the farm sends it to
 * nobody else.
 */
export const SeedPlantedPayload = z.discriminatedUnion('seed', [
  z.object({ seed: z.literal('plan'), fromSeq: Seq.optional(), ...planFields }),
  z.object({
    seed: z.literal('remember'),
    fromSeq: Seq.optional(),
    title: text(80),
    about: PersonId,
    nudgeAt: EpochMs,
  }),
]);
export type SeedPlantedPayload = z.infer<typeof SeedPlantedPayload>;

/** Changes to a plan after planting: a day suggested, a place, passing the organiser's hat. */
export const SeedChangedPayload = z.object({
  seed: Seq,
  title: planFields.title.optional(),
  days: planFields.days.optional(),
  place: planFields.place.optional(),
  yeses: planFields.yeses.optional(),
  someday: planFields.someday.optional(),
  hat: PersonId.optional(),
  /** The day the leading option is settled ("let it sprout on Thursday"). */
  settleOn: LocalDate.nullable().optional(),
});
export type SeedChangedPayload = z.infer<typeof SeedChangedPayload>;

/** Leans on a day option (a bud); `on: false` takes the vote back. */
export const VotePayload = z.object({
  seed: Seq,
  option: z.int().min(0).max(13),
  on: z.boolean(),
});
export type VotePayload = z.infer<typeof VotePayload>;

export const RsvpPayload = z.object({
  seed: Seq,
  answer: z.enum(['in', 'maybe', 'out']),
});
export type RsvpPayload = z.infer<typeof RsvpPayload>;

/** "I'm here" on the day of a hangout (06-06). */
export const CheckinPayload = z.object({ seed: Seq });
export type CheckinPayload = z.infer<typeof CheckinPayload>;

/* Keepsakes */

/** A gift on someone's step; opening it shows "opened" to the giver, never a time. */
export const GiftPayload = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('given'),
    gift: Id,
    to: PersonId,
    /** The product id of the item, pack or theme. */
    item: z.string().regex(/^[a-z0-9_.-]{1,100}$/),
    wrap: ArtId,
  }),
  z.object({ action: z.literal('opened'), gift: Id }),
]);
export type GiftPayload = z.infer<typeof GiftPayload>;

/** A pressed scrapbook page (07-06), or a page any member hides. */
export const ScrapbookPagePayload = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('pressed'),
    title: text(80),
    /** The hangout it came from, if any. */
    seed: Seq.optional(),
    /** Messages, photos and voice notes kept on the page, by seq. */
    items: z.array(Seq).max(50),
    flower: PlantId.optional(),
  }),
  z.object({ action: z.literal('hidden'), target: Seq }),
]);
export type ScrapbookPagePayload = z.infer<typeof ScrapbookPagePayload>;
