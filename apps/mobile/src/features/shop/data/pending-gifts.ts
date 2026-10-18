import type { ArtId, FarmId, GiftView, Id, OpId, PersonId } from '@kithfield/contracts';

/*
 * Gifts the person started and paid for that may not be on the step yet: the app closed between
 * the store's sheet and the farm hearing of it. They are kept on the phone until the server says
 * the gift is given, and picked up again when the shop opens.
 */

export interface PendingGift {
  readonly gift: Id;
  readonly farm: FarmId;
  readonly to: PersonId;
  readonly item: ArtId;
  readonly wrap: ArtId;
  readonly note?: string;
  /** The store transaction that paid for it, once the store answered. */
  readonly transaction: string | null;
  /** When it was started. */
  readonly at: number;
}

/** A purchase not heard of after this long isn't coming. */
export const PENDING_GIFT_TTL_MS = 86_400_000;

export type GiftStep = 'give' | 'pay' | 'wait' | 'drop';

/** What to do with a pending gift, given what the server says of it now. */
export function nextStep(
  pending: PendingGift,
  server: GiftView['state'] | 'missing',
  now: number,
): GiftStep {
  if (server === 'paid') return 'give';
  if (server === 'unpaid') {
    if (pending.transaction !== null) return 'pay';
    return now - pending.at > PENDING_GIFT_TTL_MS ? 'drop' : 'wait';
  }
  return 'drop';
}

/** 32-bit FNV-1a, as eight hex digits. */
const fnv = (text: string, seed: number): string => {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/**
 * The one op id a gift is left on the step with (a UUIDv7 shape: its start time, then a hash of
 * the gift id), so leaving it again after a crash is the same write, never a second one.
 */
export function giftOpId(gift: Id, at: number): OpId {
  const time = Math.max(0, Math.floor(at)).toString(16).padStart(12, '0').slice(-12);
  const rest = `${fnv(gift, 1)}${fnv(gift, 2)}${fnv(gift, 3)}`;
  const variant = ((parseInt(rest.charAt(3), 16) & 0x3) | 0x8).toString(16);
  return `${time.slice(0, 8)}-${time.slice(8, 12)}-7${rest.slice(0, 3)}-${variant}${rest.slice(4, 7)}-${rest.slice(7, 19)}`;
}

/** The `gift {given}` that leaves a pending gift on its friend's step. */
export const givenPayload = (pending: PendingGift) => ({
  action: 'given' as const,
  gift: pending.gift,
  to: pending.to,
  item: pending.item,
  wrap: pending.wrap,
  ...(pending.note ? { note: pending.note } : {}),
});
