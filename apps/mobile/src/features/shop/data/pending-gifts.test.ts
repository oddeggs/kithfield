import { describe, expect, it } from '@jest/globals';
import { OpId } from '@kithfield/contracts';

import { giftOpId, nextStep, type PendingGift } from './pending-gifts';

const DAY = 86_400_000;
const gift = (over: Partial<PendingGift> = {}): PendingGift => ({
  gift: '96bbd33d-9978-4c25-a556-c215ba0e19eb',
  farm: 'farm1',
  to: 'otis',
  item: 'moth',
  wrap: 'clay',
  transaction: null,
  at: 1_792_359_000_000,
  ...over,
});

describe('gifts paid for but not left on the step yet', () => {
  it('leaves a paid gift on the step', () => {
    expect(nextStep(gift({ transaction: 'tx1' }), 'paid', gift().at + 1000)).toBe('give');
  });

  it('ties a bought gift to its transaction when the server has not heard yet', () => {
    expect(nextStep(gift({ transaction: 'tx1' }), 'unpaid', gift().at + 1000)).toBe('pay');
  });

  it('waits a day for a purchase that may still land, then lets it go', () => {
    expect(nextStep(gift(), 'unpaid', gift().at + 1000)).toBe('wait');
    expect(nextStep(gift(), 'unpaid', gift().at + DAY + 1)).toBe('drop');
  });

  it('forgets gifts already given, opened or unknown to the server', () => {
    expect(nextStep(gift(), 'given', gift().at)).toBe('drop');
    expect(nextStep(gift(), 'opened', gift().at)).toBe('drop');
    expect(nextStep(gift(), 'missing', gift().at)).toBe('drop');
  });

  it('gives each gift one op id, so leaving it again never writes it twice', () => {
    const id = giftOpId(gift().gift, gift().at);
    expect(OpId.safeParse(id).success).toBe(true);
    expect(giftOpId(gift().gift, gift().at)).toBe(id);
    expect(giftOpId('another-gift-id', gift().at)).not.toBe(id);
  });
});
