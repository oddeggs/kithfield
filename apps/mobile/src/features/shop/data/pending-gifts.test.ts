import { describe, expect, it } from '@jest/globals';
import { OpId } from '@kithfield/contracts';

import { giftOpId, givenPayload, leaveGift, nextStep, type PendingGift } from './pending-gifts';

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

  it('leaves a gift on the step of a farm both people live on', async () => {
    const sent: unknown[] = [];
    const ways = {
      send: (...args: unknown[]) => {
        sent.push(args);
        return Promise.resolve({ status: 'queued' as const });
      },
      atGate: () => Promise.reject(new Error('not a gate')),
    };
    expect(await leaveGift(gift(), ways)).toBe(true);
    expect(sent).toEqual([
      ['farm1', 'gift', givenPayload(gift()), giftOpId(gift().gift, gift().at)],
    ]);
  });

  it('leaves a gift at the gate of the farm being visited, under its one op id', async () => {
    const posted: unknown[] = [];
    const answer = { result: 'ack' as const, opId: giftOpId(gift().gift, gift().at), seq: 9 };
    const ways = {
      send: () => Promise.reject(new Error('not a member')),
      atGate: (...args: unknown[]) => {
        posted.push(args);
        return Promise.resolve(answer);
      },
    };
    const atGate = gift({ gate: true, note: 'for the porch' });
    expect(await leaveGift(atGate, ways)).toBe(true);
    expect(posted).toEqual([
      [
        'farm1',
        {
          opId: giftOpId(atGate.gift, atGate.at),
          gesture: {
            gesture: 'gift',
            gift: atGate.gift,
            to: 'otis',
            item: 'moth',
            wrap: 'clay',
            note: 'for the porch',
          },
        },
      ],
    ]);
    const refused = { result: 'rejected' as const, opId: answer.opId, reason: 'limit_reached' };
    expect(
      await leaveGift(atGate, { ...ways, atGate: () => Promise.resolve(refused) } as never),
    ).toBe(false);
  });
});
