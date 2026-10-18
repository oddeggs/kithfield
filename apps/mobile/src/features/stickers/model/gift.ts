import type { GiftPayload, GiftStart, GiftStartRequest, GiftView } from '@kithfield/contracts';

import type { PurchaseResult } from '../purchase';

/*
 * Giving a pack: the server starts the gift (and says which store product pays for it), the shop's
 * flow takes the payment, the server records the store's transaction, and the phone leaves the
 * gift on the farm (`gift {given}`), which only the giver can do, once.
 */

export type GiftOutcome =
  | { readonly status: 'given' }
  /** The friend already owns the pack. */
  | { readonly status: 'already_has' }
  /** They can't receive it (never says why). */
  | { readonly status: 'unavailable' }
  | { readonly status: 'cancelled' }
  /** Nothing was charged, or the payment went through and the gift waits to be given again. */
  | { readonly status: 'failed' }
  /** No store on this phone. */
  | { readonly status: 'store_closed' };

export interface GiftSteps {
  start(req: GiftStartRequest): Promise<GiftStart>;
  pay(product: string): Promise<PurchaseResult>;
  paid(gift: string, transaction: string): Promise<GiftView>;
  give(payload: GiftPayload): Promise<{ readonly status: 'queued' | 'refused' }>;
}

/** The status an API error carries, if it is one. */
const statusOf = (e: unknown): number | null =>
  typeof e === 'object' && e !== null && 'status' in e && typeof e.status === 'number'
    ? e.status
    : null;

export async function giveGift(
  steps: GiftSteps,
  gift: GiftStartRequest & { readonly note?: string },
): Promise<GiftOutcome> {
  let started: GiftStart;
  try {
    started = await steps.start({ farm: gift.farm, to: gift.to, item: gift.item, wrap: gift.wrap });
  } catch (e) {
    const status = statusOf(e);
    if (status === 409) return { status: 'already_has' };
    if (status === 403) return { status: 'unavailable' };
    return { status: 'failed' };
  }
  const paid = await steps.pay(started.product);
  if (paid.status === 'cancelled') return { status: 'cancelled' };
  if (paid.status === 'unavailable') return { status: 'store_closed' };
  if (paid.status !== 'purchased') return { status: 'failed' };
  try {
    const view = await steps.paid(started.gift, paid.transaction);
    if (view.state === 'unpaid') return { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
  const note = gift.note?.trim();
  const sent = await steps.give({
    action: 'given',
    gift: started.gift,
    to: gift.to,
    item: gift.item,
    wrap: gift.wrap,
    ...(note ? { note } : {}),
  });
  return sent.status === 'queued' ? { status: 'given' } : { status: 'failed' };
}
