import { describe, expect, it } from 'vitest';

import { api, cast, plantFarm } from '../farm/support/doubles';
import { entitlements, postWebhook, rcEvent, tell } from './support';

describe('RevenueCat webhook', () => {
  it('refuses a sender without the shared secret', async () => {
    const { pip } = await cast('pip');
    const response = await postWebhook(
      rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.patron.monthly'),
      'nope',
    );
    expect(response.status).toBe(401);
    expect((await entitlements(pip)).perks).toBe(false);
  });

  it('turns perks on, keeps them while ending, and rests them on expiry; owned items stay', async () => {
    const { pip } = await cast('pip');
    const start = rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.patron.yearly');
    expect((await tell(start)).outcome).toBe('applied');
    let e = await entitlements(pip);
    expect(e.perks).toBe(true);
    expect(e.patronage).toMatchObject({
      tier: 'patron',
      via: 'own',
      period: 'year',
      state: 'active',
    });
    // The month's parcel arrives with the perks.
    expect(e.owned.length).toBe(1);

    const kept = await api(pip, 'POST', '/v1/shop/items/lighthouse/keep');
    expect(kept.status).toBe(200);
    expect((kept.body as { owned: string[] }).owned).toContain('lighthouse');

    await tell(
      rcEvent(pip.id, 'CANCELLATION', 'kf.patron.yearly', { cancel_reason: 'UNSUBSCRIBE' }),
    );
    e = await entitlements(pip);
    expect(e.perks).toBe(true);
    expect(e.patronage?.state).toBe('ending');

    await tell(
      rcEvent(pip.id, 'EXPIRATION', 'kf.patron.yearly', { expiration_reason: 'UNSUBSCRIBE' }),
    );
    e = await entitlements(pip);
    expect(e.perks).toBe(false);
    expect(e.patronage).toMatchObject({ state: 'lapsed', until: null });
    expect(e.owned).toContain('lighthouse');
    expect((await api(pip, 'POST', '/v1/shop/items/windmill/keep')).status).toBe(403);
  });

  it('applies an event once, and never lets an older one undo a newer', async () => {
    const { pip } = await cast('pip');
    const start = rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.patron.monthly');
    await tell(start);
    expect((await tell(start)).outcome).toBe('duplicate');
    const expired = rcEvent(pip.id, 'EXPIRATION', 'kf.patron.monthly');
    await tell(expired);
    const late = rcEvent(pip.id, 'RENEWAL', 'kf.patron.monthly', {
      event_timestamp_ms: expired.event_timestamp_ms - 10_000,
    });
    await tell(late);
    expect((await entitlements(pip)).perks).toBe(false);
  });

  it('owns a bought item, takes it back on a refund, and acknowledges strangers', async () => {
    const { pip } = await cast('pip');
    const bought = rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.item.houseboat');
    await tell(bought);
    expect((await entitlements(pip)).owned).toContain('houseboat');
    await tell(
      rcEvent(pip.id, 'CANCELLATION', 'kf.item.houseboat', {
        cancel_reason: 'CUSTOMER_SUPPORT',
        transaction_id: bought.transaction_id ?? null,
      }),
    );
    expect((await entitlements(pip)).owned).not.toContain('houseboat');
    expect(
      (await tell(rcEvent('nobody-here', 'INITIAL_PURCHASE', 'kf.patron.monthly'))).outcome,
    ).toBe('ignored');
    expect((await tell(rcEvent(pip.id, 'SOMETHING_NEW', 'kf.patron.monthly'))).outcome).toBe(
      'ignored',
    );
  });

  it('keeps Founding Farmer for life', async () => {
    const { pip } = await cast('pip');
    await tell(rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.founding', { expiration_at_ms: null }));
    const e = await entitlements(pip);
    expect(e.perks).toBe(true);
    expect(e.patronage).toMatchObject({ tier: 'founding', period: 'lifetime', until: null });
  });

  it('moves purchases on a transfer', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    await tell(rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.patron.monthly'));
    await tell(
      rcEvent(fig.id, 'TRANSFER', 'kf.patron.monthly', {
        transferred_from: [pip.id],
        transferred_to: [fig.id],
      }),
    );
    expect((await entitlements(pip)).perks).toBe(false);
    expect((await entitlements(fig)).perks).toBe(true);
  });
});

describe('Farm Plus', () => {
  it('covers the members of the farm the payer picks, and only once picked', async () => {
    const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
    const { farm } = await plantFarm(pip, [fig]);
    expect((await api(pip, 'PUT', '/v1/me/farm-plus', { farm })).status).toBe(403);
    await tell(rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.farmplus.monthly'));
    expect((await entitlements(fig)).perks).toBe(false);
    expect((await api(pip, 'PUT', '/v1/me/farm-plus', { farm })).status).toBe(204);
    const payer = await entitlements(pip);
    expect(payer.farmPlus).toEqual({ farm, covered: [pip.id, fig.id] });
    const friend = await entitlements(fig);
    expect(friend.perks).toBe(true);
    expect(friend.patronage).toMatchObject({ tier: 'farm_plus', via: 'farm_plus', period: null });
    expect((await entitlements(bea)).perks).toBe(false);
  });
});

describe('patrons', () => {
  it('offers Founding Farmer only with a flag, never a countdown', async () => {
    const { pip } = await cast('pip');
    const offer = await api(pip, 'GET', '/v1/patrons/offer');
    const { products, founding } = offer.body as { products: string[]; founding: boolean };
    expect(products).toContain('kf.patron.monthly');
    expect(products.includes('kf.founding')).toBe(founding);
  });

  it('keeps a wall name after patronage lapses, and votes only with perks', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    expect((await api(pip, 'PUT', '/v1/me/wall', { name: 'Pip' })).status).toBe(403);
    await tell(rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.patron.monthly'));
    expect((await api(pip, 'PUT', '/v1/me/wall', { name: '  Pip  ' })).status).toBe(204);
    await tell(rcEvent(pip.id, 'EXPIRATION', 'kf.patron.monthly'));
    const wall = await api(fig, 'GET', '/v1/patrons/wall');
    expect((wall.body as { names: string[] }).names).toContain('Pip');
    expect((await api(pip, 'GET', '/v1/patrons/vote')).status).toBe(403);
  });
});
