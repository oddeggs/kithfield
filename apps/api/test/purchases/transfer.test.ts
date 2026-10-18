import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { mergeWrites } from '../../src/purchases/people';
import { api, cast } from '../farm/support/doubles';
import { boughtConsumable, entitlements, rcEvent, tell } from './support';

const owned = async (person: string) =>
  (
    await env.DB.prepare('SELECT item, via FROM owned_items WHERE person_id = ? ORDER BY item')
      .bind(person)
      .all<{ item: string; via: string }>()
  ).results;

/** Pip owns something of every kind: bought, Founding Farmer, a gift, a patron keep, a parcel. */
const stocked = async () => {
  const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
  await tell(rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.founding', { expiration_at_ms: null }));
  await tell(
    rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.item.windmill', { expiration_at_ms: null }),
  );
  await entitlements(pip); // the month's parcel
  expect((await api(pip, 'POST', '/v1/shop/items/houseboat/keep')).status).toBe(200);
  await env.DB.prepare(
    `INSERT INTO owned_items (person_id, item, via, from_id, at) VALUES (?, 'snail', 'gift', ?, 1)`,
  )
    .bind(pip.id, bea.id)
    .run();
  const tx = await boughtConsumable(pip, 'kf.gift.299');
  return { pip, fig, tx };
};

describe('moving purchases between people', () => {
  it('moves only what the store sold on a RevenueCat transfer', async () => {
    const { pip, fig, tx } = await stocked();
    await tell(
      rcEvent(fig.id, 'TRANSFER', 'kf.founding', {
        transferred_from: [pip.id],
        transferred_to: [fig.id],
      }),
    );
    expect((await owned(fig.id)).map((r) => r.item)).toEqual(['windmill']);
    expect((await entitlements(fig)).patronage?.tier).toBe('founding');
    expect((await owned(pip.id)).map((r) => r.via).sort()).toEqual(['gift', 'parcel', 'patron']);
    const moved = await env.DB.prepare('SELECT person_id FROM store_transactions WHERE id = ?')
      .bind(tx)
      .first<{ person_id: string }>();
    expect(moved?.person_id).toBe(fig.id);
  });

  it('moves everything when one person is merged into another', async () => {
    const { pip, fig } = await stocked();
    await env.DB.batch(mergeWrites(env.DB, { from: pip.id, into: fig.id, now: Date.now() }));
    expect(await owned(pip.id)).toEqual([]);
    expect((await owned(fig.id)).map((r) => r.via).sort()).toEqual([
      'bought',
      'gift',
      'parcel',
      'patron',
    ]);
    expect((await entitlements(fig)).patronage?.tier).toBe('founding');
  });
});
