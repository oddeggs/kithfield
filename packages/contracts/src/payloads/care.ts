import { z } from 'zod';

import {
  ArtId,
  Critter,
  DisplayName,
  EpochMs,
  Id,
  LIMITS,
  LocalDate,
  LocalTime,
  PersonId,
  Place,
  PlantId,
  Seq,
  openEnum,
  text,
} from '../primitives';

/* Gestures */

/**
 * A dewdrop on a message (`target`, drawn in its reaction row), for a person (`to`; on their
 * birthday it waters the rose), or for the farm (neither). Never both.
 */
export const DewdropPayload = z
  .object({
    target: Seq.optional(),
    to: PersonId.optional(),
  })
  .refine((p) => p.target === undefined || p.to === undefined, {
    message: 'A dewdrop goes on a message or to a person, not both',
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

/** The kinds of warmth a hug can carry that this app knows how to draw. */
export const KNOWN_WARMTHS = ['here', 'thinking', 'soup', 'glow'] as const;

/** A hug's warmth: an open string on the wire; see `KNOWN_WARMTHS`. */
export const Warmth = openEnum();
export type Warmth = z.infer<typeof Warmth>;

/** A hug, or an umbrella brought to someone under a rain cloud (then `to` is required). */
export const HugPayload = z
  .object({
    to: PersonId.optional(),
    umbrella: z.boolean().optional(),
    warmth: Warmth.optional(),
  })
  .refine((p) => p.umbrella !== true || p.to !== undefined, {
    message: 'An umbrella is brought to someone',
    path: ['to'],
  });
export type HugPayload = z.infer<typeof HugPayload>;

/** A note marked "no reply needed". */
export const QuietNotePayload = z.object({ text: text(LIMITS.message) });
export type QuietNotePayload = z.infer<typeof QuietNotePayload>;

/** When a slow post arrives: the friend's next morning, or the coming weekend, in their time zone. */
export const SlowPostWhen = z.enum(['morning', 'weekend']);
export type SlowPostWhen = z.infer<typeof SlowPostWhen>;

export const SlowPostCommandPayload = z.object({
  to: PersonId,
  text: text(LIMITS.message),
  when: SlowPostWhen,
});
export type SlowPostCommandPayload = z.infer<typeof SlowPostCommandPayload>;

/**
 * Written at send time; the farm sets `deliverAt` from `when` and the friend's time zone, and
 * phones show it only from `deliverAt`. Recalling it is an `unsend`, allowed until `deliverAt`.
 */
export const SlowPostPayload = SlowPostCommandPayload.extend({ deliverAt: EpochMs });
export type SlowPostPayload = z.infer<typeof SlowPostPayload>;

/** Signs a member's birthday card, on their birthday. */
export const CardSignedPayload = z.object({
  to: PersonId,
  text: text(200),
});
export type CardSignedPayload = z.infer<typeof CardSignedPayload>;

/* Plans */

export const DayOption = z.object({
  date: LocalDate,
  from: LocalTime.optional(),
});
export type DayOption = z.infer<typeof DayOption>;

/** How many yeses a plan needs to sprout. */
export const Yeses = z.enum(['couple', 'most', 'everyone']);
export type Yeses = z.infer<typeof Yeses>;

const planFields = {
  title: text(80),
  days: z.array(DayOption).max(14),
  place: Place.nullable(),
  yeses: Yeses,
  /** Resting in the shed: "someday". */
  someday: z.boolean(),
};

/**
 * A plan seed, planted from a message or from nothing. Remember-me seeds are personal and never in
 * the farm log: see the remember bodies in the HTTP contracts.
 */
export const SeedPlantedPayload = z.object({ fromSeq: Seq.optional(), ...planFields });
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

/** "I'm here" on the day of a hangout. */
export const CheckinPayload = z.object({ seed: Seq });
export type CheckinPayload = z.infer<typeof CheckinPayload>;

/* Keepsakes */

/** A product id from the store: an item, a sticker pack or a farm theme. */
export const ProductId = z.string().regex(/^[a-z0-9_.-]{1,100}$/);
export type ProductId = z.infer<typeof ProductId>;

const giftFields = {
  gift: Id,
  to: PersonId,
  item: ProductId,
  wrap: ArtId,
};

/** A gift on someone's step; opening it shows "opened" to the giver, never a time. */
export const GiftPayload = z.discriminatedUnion('action', [
  z.object({ action: z.literal('given'), ...giftFields }),
  z.object({ action: z.literal('opened'), gift: Id }),
]);
export type GiftPayload = z.infer<typeof GiftPayload>;

/** A pressed scrapbook page, or a page any member hides. */
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

/* Visitors at the gate */

/** What a visitor from another farm may do at this farm's gate. They can't read its chat. */
export const GateGesture = z.discriminatedUnion('gesture', [
  z.object({ gesture: z.literal('wave') }),
  z.object({
    gesture: z.literal('firefly'),
    to: PersonId,
    words: text(LIMITS.fireflyWords).optional(),
  }),
  z.object({ gesture: z.literal('gift'), ...giftFields }),
]);
export type GateGesture = z.infer<typeof GateGesture>;

/**
 * A visitor's gesture, written by the farm with the visitor as actor, and how to draw them.
 * Deleting the visitor's account tombstones their `gate` and `traded` events on the farms they
 * visited too, not only on their own farms.
 */
export const GatePayload = z.object({
  visitor: z.object({ name: DisplayName, critter: Critter }),
  gesture: GateGesture,
});
export type GatePayload = z.infer<typeof GatePayload>;
