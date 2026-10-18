import { BookQuote, ShopCart, ShopCatalog, type Wishlist } from '@kithfield/contracts';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { call } from '../../src/auth/testing/client';
import { stripeSignature, verifyStripe } from '../../src/purchases/stripe';
import { api, cast, plantFarm } from '../farm/support/doubles';

describe('the shop', () => {
  it('answers the catalogue and the cart in their contract shapes, with no prices', async () => {
    const { pip } = await cast('pip');
    const catalog = (await api(pip, 'GET', '/v1/shop/catalog')).body as ShopCatalog;
    expect(ShopCatalog.safeParse(catalog).success).toBe(true);
    expect(JSON.stringify(catalog)).not.toMatch(/price|£|\$/);
    expect(catalog.items.find((i) => i.item === 'mushroom')).toMatchObject({
      product: null,
      giftProduct: null,
      patrons: true,
    });
    expect(catalog.items.find((i) => i.item === 'lighthouse')).toMatchObject({
      product: 'kf.item.lighthouse',
      giftProduct: 'kf.gift.499',
      set: 'lighthouse_keeper',
    });
    expect(catalog.items.filter((i) => i.kind === 'theme')).toHaveLength(4);
    const cart = (await api(pip, 'GET', '/v1/shop/cart')).body as ShopCart;
    expect(ShopCart.safeParse(cart).success).toBe(true);
  });

  it('keeps a wishlist, which friends on a shared farm can read and strangers cannot', async () => {
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    const { farm } = await plantFarm(pip, [fig]);
    expect((await api(fig, 'PUT', '/v1/me/wishlist/treehouse')).status).toBe(204);
    expect((await api(fig, 'PUT', '/v1/me/wishlist/not_a_thing')).status).toBe(404);
    const theirs = await api(pip, 'GET', `/v1/farms/${farm}/members/${fig.id}/wishlist`);
    expect((theirs.body as Wishlist).items.map((i) => i.item)).toEqual(['treehouse']);
    expect((await api(kit, 'GET', `/v1/farms/${farm}/members/${fig.id}/wishlist`)).status).toBe(
      404,
    );
    expect((await api(fig, 'DELETE', '/v1/me/wishlist/treehouse')).status).toBe(204);
  });

  it('quotes the printed book, and says ordering is not available yet', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const quote = (await api(pip, 'GET', `/v1/farms/${farm}/book?year=2026`)).body as BookQuote;
    expect(BookQuote.safeParse(quote).success).toBe(true);
    expect(quote).toMatchObject({ pages: 24, cloths: ['moss', 'rose', 'ink', 'mustard'] });
    const order = await api(pip, 'POST', `/v1/farms/${farm}/book/orders`, {
      year: 2026,
      cloth: 'moss',
      split: true,
    });
    expect(order.status).toBe(503);
  });

  it('serves the costs page without a session', async () => {
    const report = {
      month: '2026-09',
      spent: [{ line: 'servers', amount: { amount: 312000, currency: 'GBP' } }],
      income: [{ line: 'patrons', amount: { amount: 1584000, currency: 'GBP' } }],
      setAside: { amount: 41000, currency: 'GBP' },
    };
    await env.DB.prepare('INSERT INTO costs_reports (month, report_json, at) VALUES (?, ?, ?)')
      .bind('2026-09', JSON.stringify(report), Date.now())
      .run();
    const response = await call('/v1/costs?month=2026-09');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
    expect((await call('/v1/costs?month=2020-01')).status).toBe(404);
  });
});

describe('Stripe webhook', () => {
  const secret = 'whsec_test_secret';

  it('checks the signature over the raw body, recently', async () => {
    const body = '{"id":"evt_1"}';
    const now = Date.now();
    const t = String(Math.floor(now / 1000));
    const v1 = await stripeSignature(secret, t, body);
    expect(await verifyStripe(secret, `t=${t},v1=${v1}`, body, now)).toBe(true);
    expect(await verifyStripe(secret, `t=${t},v1=${v1}`, `${body} `, now)).toBe(false);
    expect(await verifyStripe('whsec_other', `t=${t},v1=${v1}`, body, now)).toBe(false);
    expect(await verifyStripe(secret, `t=${t},v1=${v1}`, body, now + 301_000)).toBe(false);
    expect(await verifyStripe(secret, undefined, body, now)).toBe(false);
  });

  it('refuses an unsigned post and acknowledges a signed event it does not act on', async () => {
    const body = JSON.stringify({
      id: 'evt_123',
      type: 'customer.created',
      livemode: false,
      created: 1,
      data: { object: { id: 'cus_1', object: 'customer' } },
    });
    expect((await call('/v1/webhooks/stripe', { body: JSON.parse(body) as object })).status).toBe(
      401,
    );
    const t = String(Math.floor(Date.now() / 1000));
    const v1 = await stripeSignature(secret, t, body);
    const response = await fetchRaw(body, `t=${t},v1=${v1}`);
    expect(response.status).toBe(200);
  });
});

/** The raw body exactly as signed (the JSON helper would re-serialise it). */
const fetchRaw = (body: string, signature: string) =>
  exports.default.fetch('https://dev.kithfield.com/api/v1/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    body,
  });
