import type { GiftStart, GiftView } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { op } from '../farm/support/client';
import { api, cast, plantFarm, useTestPorts } from '../farm/support/doubles';
import { boughtConsumable, entitlements, tell, rcEvent } from './support';

beforeEach(() => {
  useTestPorts({ at: Date.now() });
});

const giftState = (gift: string) =>
  env.DB.prepare('SELECT state FROM gifts WHERE id = ?').bind(gift).first<{ state: string }>();

describe('gifts', () => {
  it('is reserved, paid by its store transaction, and given once through the farm', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const start = await api(pip, 'POST', '/v1/gifts', {
      farm,
      to: fig.id,
      item: 'moth',
      wrap: 'clay',
    });
    expect(start.status).toBe(200);
    const { gift, product } = start.body as GiftStart;
    expect(product).toBe('kf.gift.299');

    // Not paid yet: the farm refuses the gift id.
    const early = await stub.command(pip.id, {
      opId: op(1),
      kind: 'gift',
      payload: { action: 'given', gift, to: fig.id, item: 'moth', wrap: 'clay' },
    });
    expect(early).toMatchObject({ result: 'rejected', reason: 'not_found' });

    // A transaction the store hasn't told us of is not enough.
    const unknown = await api(pip, 'POST', `/v1/gifts/${gift}/paid`, { transaction: 'tx-unseen' });
    expect((unknown.body as GiftView).state).toBe('unpaid');
    const tx = await boughtConsumable(pip, product);
    const paid = await api(pip, 'POST', `/v1/gifts/${gift}/paid`, { transaction: tx });
    expect((paid.body as GiftView).state).toBe('paid');

    const given = await stub.command(pip.id, {
      opId: op(2),
      kind: 'gift',
      payload: { action: 'given', gift, to: fig.id, item: 'moth', wrap: 'clay', note: 'for you' },
    });
    expect(given).toMatchObject({ result: 'ack' });
    expect((await entitlements(fig)).owned).toContain('moth');
    // The same op id is answered again; a new one can't give the gift twice.
    expect(
      await stub.command(pip.id, {
        opId: op(2),
        kind: 'gift',
        payload: { action: 'given', gift, to: fig.id, item: 'moth', wrap: 'clay', note: 'for you' },
      }),
    ).toMatchObject({ result: 'ack' });
    expect(
      await stub.command(pip.id, {
        opId: op(3),
        kind: 'gift',
        payload: { action: 'given', gift, to: fig.id, item: 'moth', wrap: 'clay' },
      }),
    ).toMatchObject({ result: 'rejected', reason: 'not_found' });

    // The friend opens it; the giver sees "opened".
    await stub.command(fig.id, { opId: op(4), kind: 'gift', payload: { action: 'opened', gift } });
    expect(((await api(pip, 'GET', `/v1/gifts/${gift}`)).body as GiftView).state).toBe('opened');

    // A friend who owns it can't be given it again; a used transaction pays for nothing else.
    expect(
      (await api(pip, 'POST', '/v1/gifts', { farm, to: fig.id, item: 'moth', wrap: 'fern' }))
        .status,
    ).toBe(409);
    const other = await api(pip, 'POST', '/v1/gifts', {
      farm,
      to: fig.id,
      item: 'snail',
      wrap: 'fern',
    });
    const again = await api(pip, 'POST', `/v1/gifts/${(other.body as GiftStart).gift}/paid`, {
      transaction: tx,
    });
    expect(again.status).toBe(409);
  });

  it('goes back to waiting when the farm refuses the write after the claim', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const { gift, product } = (
      await api(pip, 'POST', '/v1/gifts', { farm, to: fig.id, item: 'bee', wrap: 'plum' })
    ).body as GiftStart;
    await api(pip, 'POST', `/v1/gifts/${gift}/paid`, {
      transaction: await boughtConsumable(pip, product),
    });
    await stub.freeze(true);
    const refused = await stub.command(pip.id, {
      opId: op(10),
      kind: 'gift',
      payload: { action: 'given', gift, to: fig.id, item: 'bee', wrap: 'plum' },
    });
    expect(refused.result).toBe('rejected');
    expect((await giftState(gift))?.state).toBe('paid');
    expect((await entitlements(fig)).owned).not.toContain('bee');
  });

  it('is unavailable between people where either blocked the other', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    await api(fig, 'PUT', `/v1/blocks/${pip.id}`);
    const start = await api(pip, 'POST', '/v1/gifts', {
      farm,
      to: fig.id,
      item: 'bee',
      wrap: 'plum',
    });
    expect(start.status).toBe(403);
  });

  it('shows a farm theme only once the farm owns it', async () => {
    const { pip } = await cast('pip');
    const { stub } = await plantFarm(pip);
    const shown = await stub.command(pip.id, {
      opId: op(20),
      kind: 'settings_changed',
      payload: { setting: 'theme', theme: 'snowy_hollow' },
    });
    expect(shown).toMatchObject({ result: 'rejected', reason: 'not_allowed' });
  });

  it('records consumables told by the webhook only once', async () => {
    const { pip } = await cast('pip');
    const event = rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.gift.199');
    await tell(event);
    expect((await tell(event)).outcome).toBe('duplicate');
  });
});
