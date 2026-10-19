import { describe, expect, it, jest } from '@jest/globals';
import type { GiftPayload } from '@kithfield/contracts';

import type { PurchaseResult } from '../purchase';
import { giveGift, type GiftSteps } from './gift';

const req = {
  farm: 'f1',
  to: 'bea',
  item: 'big_feelings',
  wrap: 'clay',
  note: '  for the new job x ',
};

function steps(over: Partial<GiftSteps> = {}): GiftSteps & { given: GiftPayload[] } {
  const given: GiftPayload[] = [];
  return {
    given,
    start: () => Promise.resolve({ gift: 'g1', product: 'kf.gift.t2' }),
    pay: () => Promise.resolve({ status: 'purchased', transaction: 'tx1' } as PurchaseResult),
    paid: () => Promise.resolve({ gift: 'g1', state: 'paid' }),
    give: (payload) => {
      given.push(payload);
      return Promise.resolve({ status: 'queued' as const });
    },
    ...over,
  };
}

const apiError = (status: number) => Object.assign(new Error('api'), { status });

describe('giving a pack', () => {
  it('starts, pays through the shop, records the payment and leaves the gift on the farm', async () => {
    const pay = jest.fn((product: string) =>
      Promise.resolve({ status: 'purchased', transaction: `tx-${product}` } as PurchaseResult),
    );
    const s = steps({ pay });
    expect(await giveGift(s, req)).toEqual({ status: 'given' });
    expect(pay).toHaveBeenCalledWith('kf.gift.t2');
    expect(s.given).toEqual([
      {
        action: 'given',
        gift: 'g1',
        to: 'bea',
        item: 'big_feelings',
        wrap: 'clay',
        note: 'for the new job x',
      },
    ]);
  });

  it('leaves an empty note off the tag', async () => {
    const s = steps();
    await giveGift(s, { ...req, note: '   ' });
    expect(s.given[0]).not.toHaveProperty('note');
  });

  it('stops before paying when the friend already has it or can’t receive it', async () => {
    const pay = jest.fn(() =>
      Promise.resolve({ status: 'purchased', transaction: 'x' } as PurchaseResult),
    );
    expect(await giveGift(steps({ start: () => Promise.reject(apiError(409)), pay }), req)).toEqual(
      { status: 'already_has' },
    );
    expect(await giveGift(steps({ start: () => Promise.reject(apiError(403)), pay }), req)).toEqual(
      { status: 'unavailable' },
    );
    expect(pay).not.toHaveBeenCalled();
  });

  it('gives nothing when the store sheet is closed or the store is missing', async () => {
    const cancelled = steps({ pay: () => Promise.resolve({ status: 'cancelled' }) });
    expect(await giveGift(cancelled, req)).toEqual({ status: 'cancelled' });
    expect(cancelled.given).toEqual([]);
    expect(
      await giveGift(steps({ pay: () => Promise.resolve({ status: 'unavailable' }) }), req),
    ).toEqual({ status: 'store_closed' });
  });

  it('doesn’t leave the gift when the payment isn’t recorded', async () => {
    const s = steps({ paid: () => Promise.reject(apiError(500)) });
    expect(await giveGift(s, req)).toEqual({ status: 'failed' });
    expect(s.given).toEqual([]);
  });
});
