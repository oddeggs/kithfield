import type { ChipIn, Id, StoreProductId } from '@kithfield/contracts';

/** What to do when someone taps to pay their share: buy, or show the chip-in as it is now. */
export type PayGate =
  | { readonly kind: 'pay'; readonly tier: StoreProductId }
  | { readonly kind: 'refresh'; readonly chipIn: ChipIn }
  | { readonly kind: 'gone' };

/**
 * Nobody is charged until a chip-in is covered. Read again from the server right before the
 * store's sheet, so a chip-in that isn't covered (still filling, closed, or the share already paid)
 * never opens it.
 */
export function payGate(chipIn: Id, latest: readonly ChipIn[]): PayGate {
  const now = latest.find((c) => c.chipIn === chipIn);
  if (!now) return { kind: 'gone' };
  if (now.state === 'covered' && now.mine?.state === 'promised') {
    return { kind: 'pay', tier: now.mine.tier };
  }
  return { kind: 'refresh', chipIn: now };
}
