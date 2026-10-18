import { z } from 'zod';

import { ArtId, EpochMs, FarmId, HttpUrl, Id, LIMITS, Money, PersonId, text } from '../primitives';
import { StoreProductId, StoreTransactionId } from './shop';

/*
 * Gifts, chip-ins and the printed scrapbook. Amounts are private: nobody sees what anyone else
 * put in, only who chipped in and how full it is.
 */

/**
 * `POST /v1/gifts`: start a gift before paying for it. `farm` is where it will wait on the step: a
 * farm both people live on, or, for a gift left at a gate, the farm being visited. Answers
 * `GiftStart`, 409 `conflict` when the friend already owns the item, and 403 `unavailable` when
 * they can't receive it (no reason is ever shown).
 */
export const GiftStartRequest = z.object({
  farm: FarmId,
  to: PersonId,
  item: ArtId,
  wrap: ArtId,
});
export type GiftStartRequest = z.infer<typeof GiftStartRequest>;

/** The gift's id and the consumable that pays for it. */
export const GiftStart = z.object({ gift: Id, product: StoreProductId });
export type GiftStart = z.infer<typeof GiftStart>;

/**
 * `POST /v1/gifts/:gift/paid`: the store transaction that paid for it. Answers `GiftView`; once
 * `paid`, the phone sends `gift {given}` (or the gate gesture) with this id, which the farm takes
 * only from the giver and only once.
 */
export const GiftPaidRequest = z.object({ transaction: StoreTransactionId });
export type GiftPaidRequest = z.infer<typeof GiftPaidRequest>;

export const GiftView = z.object({
  gift: Id,
  state: z.enum(['unpaid', 'paid', 'given', 'opened']),
});
export type GiftView = z.infer<typeof GiftView>;

/** What friends chip in for: a wished-for gift on a member's birthday, or a farm theme. */
export const ChipInFor = z.discriminatedUnion('for', [
  z.object({
    for: z.literal('gift'),
    to: PersonId,
    item: ArtId,
    wrap: ArtId,
    note: text(LIMITS.giftNote).optional(),
  }),
  z.object({ for: z.literal('theme'), theme: ArtId }),
]);
export type ChipInFor = z.infer<typeof ChipInFor>;

/**
 * `POST /v1/farms/:id/chip-ins`: start a chip-in on a farm. A gift chip-in is for a member's
 * birthday and closes at the end of that farm day; a theme chip-in stays open until it is covered.
 * Answers `ChipIn`.
 */
export const ChipInStartRequest = ChipInFor;
export type ChipInStartRequest = z.infer<typeof ChipInStartRequest>;

/**
 * A pledge: `promised` until the chip-in is covered, then `paid`; `released` when it closed
 * uncovered before anything was charged, `refunded` when something was.
 */
export const PledgeState = z.enum(['promised', 'paid', 'released', 'refunded']);
export type PledgeState = z.infer<typeof PledgeState>;

/**
 * A chip-in as the farm's members see it. The friend a gift chip-in is for never sees it. Once
 * covered, a gift is written by the farm (`gift {given, chipIn, with}`) and a theme switches on
 * (`settings_changed {theme}` with a null actor). Not covered in time, it closes and every pledge
 * is released or refunded; the friend still gets the card.
 */
export const ChipIn = z.object({
  chipIn: Id,
  farm: FarmId,
  by: PersonId,
  what: ChipInFor,
  state: z.enum(['open', 'covered', 'closed']),
  closesAt: EpochMs.nullable(),
  /** How full it is, 0 to 1, drawn as a filling bar; never an amount. */
  filled: z.number().min(0).max(1),
  /** Who chipped in, never how much. */
  people: z.array(PersonId).max(LIMITS.members),
  /** The asker's own pledge. */
  mine: z.object({ tier: StoreProductId, state: PledgeState }).nullable(),
});
export type ChipIn = z.infer<typeof ChipIn>;

/** `GET /v1/farms/:id/chip-ins`: the farm's open chip-ins the asker may see, newest first. */
export const ChipInList = z.object({ chipIns: z.array(ChipIn).max(50) });
export type ChipInList = z.infer<typeof ChipInList>;

/** `GET /v1/chip-ins/offer`: the consumable tiers a pledge is made in. */
export const ChipInOffer = z.object({ tiers: z.array(StoreProductId).min(1).max(10) });
export type ChipInOffer = z.infer<typeof ChipInOffer>;

/**
 * `POST /v1/chip-ins/:id/pledges`: pledge one tier. `transaction` is the store transaction that
 * paid for it, or null for a promise paid once the chip-in is covered (pledging again with the
 * transaction pays it). Answers `ChipIn`.
 */
export const ChipInPledgeRequest = z.object({
  tier: StoreProductId,
  transaction: StoreTransactionId.nullable(),
});
export type ChipInPledgeRequest = z.infer<typeof ChipInPledgeRequest>;

/* The printed scrapbook: a physical book, so it is paid through Stripe, never in-app purchase. */

/** `GET /v1/farms/:id/book?year=`: the year's book as it would print. */
export const BookQuote = z.object({
  farm: FarmId,
  year: z.int().min(2026).max(9999),
  hangouts: z.int().min(0),
  pages: z.int().min(1),
  sizeCm: z.int().min(10).max(40),
  cloths: z.array(ArtId).min(1).max(10),
  price: Money,
});
export type BookQuote = z.infer<typeof BookQuote>;

/**
 * `POST /v1/farms/:id/book/orders`: order the year's book in a cloth. With `split`, friends on the
 * farm chip in too. Answers `BookCheckout` for the asker's share; the shipping address is taken by
 * Stripe Checkout from whoever orders.
 */
export const BookOrderRequest = z.object({
  year: z.int().min(2026).max(9999),
  cloth: ArtId,
  split: z.boolean(),
});
export type BookOrderRequest = z.infer<typeof BookOrderRequest>;

/**
 * A Stripe Checkout page for one share, opened in the browser. A split share is authorised, and
 * charged only once the book is covered; uncovered by `closesAt`, every hold is released.
 * `POST /v1/book-orders/:order/share` gives a friend their own.
 */
export const BookCheckout = z.object({ order: Id, url: HttpUrl, expiresAt: EpochMs });
export type BookCheckout = z.infer<typeof BookCheckout>;

/** `GET /v1/book-orders/:order`: an order, for everyone on the farm. Amounts stay private. */
export const BookOrder = z.object({
  order: Id,
  farm: FarmId,
  year: z.int().min(2026).max(9999),
  cloth: ArtId,
  by: PersonId,
  state: z.enum(['open', 'paid', 'printing', 'shipped', 'cancelled']),
  split: z
    .object({
      people: z.array(PersonId).max(LIMITS.members),
      filled: z.number().min(0).max(1),
      closesAt: EpochMs,
    })
    .nullable(),
});
export type BookOrder = z.infer<typeof BookOrder>;
