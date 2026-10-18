import type { GiftStart } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { op } from '../farm/support/client';
import { api, cast, plantFarm, useTestPorts } from '../farm/support/doubles';
import { boughtConsumable, entitlements } from './support';

beforeEach(() => {
  useTestPorts({ at: Date.now() });
});

/** Pip's paid gift of a bee for Fig, waiting to be given. */
const paidGift = async () => {
  const { pip, fig } = await cast('pip', 'fig');
  const { farm, stub } = await plantFarm(pip, [fig]);
  const { gift, product } = (
    await api(pip, 'POST', '/v1/gifts', { farm, to: fig.id, item: 'bee', wrap: 'plum' })
  ).body as GiftStart;
  await api(pip, 'POST', `/v1/gifts/${gift}/paid`, {
    transaction: await boughtConsumable(pip, product),
  });
  return { pip, fig, stub, gift };
};

const state = (gift: string) =>
  env.DB.prepare('SELECT state FROM gifts WHERE id = ?').bind(gift).first<{ state: string }>();

describe('a gift sent from a phone', () => {
  it('can’t claim to be a chip-in: only the farm writes those', async () => {
    const { pip, fig, stub, gift } = await paidGift();
    const base = { action: 'given', gift, to: fig.id, item: 'bee', wrap: 'plum' } as const;
    for (const [i, extra] of [{ chipIn: 'made-up' }, { with: [pip.id] }].entries()) {
      const answer = await stub.command(pip.id, {
        opId: op(20 + i),
        kind: 'gift',
        payload: { ...base, ...extra },
      });
      expect(answer).toMatchObject({ result: 'rejected', reason: 'not_allowed' });
    }
    expect((await state(gift))?.state).toBe('paid');
  });

  it('given back after the farm refuses it takes away only what its own claim gave', async () => {
    const { pip, fig, stub, gift } = await paidGift();
    // Fig already had a bee from Pip, from before.
    await env.DB.prepare(
      `INSERT INTO owned_items (person_id, item, via, from_id, at) VALUES (?, 'bee', 'gift', ?, 1)`,
    )
      .bind(fig.id, pip.id)
      .run();
    await stub.freeze(true);
    const refused = await stub.command(pip.id, {
      opId: op(30),
      kind: 'gift',
      payload: { action: 'given', gift, to: fig.id, item: 'bee', wrap: 'plum' },
    });
    expect(refused.result).toBe('rejected');
    expect((await state(gift))?.state).toBe('paid');
    expect((await entitlements(fig)).owned).toContain('bee');
  });
});
