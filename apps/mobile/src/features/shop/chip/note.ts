import type { ChipIn, PledgeState } from '@kithfield/contracts';

/**
 * The line under a birthday chip-in. Nobody pays until it fills; once it fills each pays their
 * share, and a share paid for a chip-in that closes before it is all paid is a credit (the gift is
 * the payer's own), never a refund.
 */
export function chipNoteKey(
  state: ChipIn['state'],
  mine: PledgeState | null,
):
  | 'shop.chip.privatePromise'
  | 'shop.chip.privatePaid'
  | 'shop.chip.closed'
  | 'shop.chip.closedPaid' {
  if (state === 'closed') return mine === 'paid' ? 'shop.chip.closedPaid' : 'shop.chip.closed';
  return mine === 'paid' ? 'shop.chip.privatePaid' : 'shop.chip.privatePromise';
}
