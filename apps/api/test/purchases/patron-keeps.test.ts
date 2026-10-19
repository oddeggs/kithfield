import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { entitlementsOf } from '../../src/purchases/entitlements';
import { api, cast } from '../farm/support/doubles';
import { rcEvent, tell } from './support';

/** A patron who kept the houseboat, then let their patronage lapse. */
const lapsedKeeper = async () => {
  const { pip } = await cast('pip');
  await tell(rcEvent(pip.id, 'INITIAL_PURCHASE', 'kf.patron.monthly'));
  expect((await api(pip, 'POST', '/v1/shop/items/houseboat/keep')).status).toBe(200);
  await tell(rcEvent(pip.id, 'EXPIRATION', 'kf.patron.monthly'));
  return pip;
};

describe('what a patron kept, once patronage lapses', () => {
  it('rests while bought items stay, and comes back when patronage resumes', async () => {
    const pip = await lapsedKeeper();
    await tell(rcEvent(pip.id, 'NON_RENEWING_PURCHASE', 'kf.item.lighthouse'));
    let e = await entitlementsOf(env.DB, pip.id, Date.now());
    expect(e.perks).toBe(false);
    expect(e.owned).not.toContain('houseboat');
    expect(e.owned).toContain('lighthouse');
    const collection = await api(pip, 'GET', '/v1/me/collection');
    const items = (collection.body as { items: { item: string }[] }).items.map((i) => i.item);
    expect(items).toEqual(expect.arrayContaining(['lighthouse']));
    expect(items).not.toContain('houseboat');
    await tell(rcEvent(pip.id, 'RENEWAL', 'kf.patron.monthly'));
    e = await entitlementsOf(env.DB, pip.id, Date.now());
    expect(e.owned).toEqual(expect.arrayContaining(['houseboat', 'lighthouse']));
  });

  it('stays theirs while patrons keep everything', async () => {
    const pip = await lapsedKeeper();
    const e = await entitlementsOf(env.DB, pip.id, Date.now(), { keepAll: true });
    expect(e.perks).toBe(false);
    expect(e.owned).toContain('houseboat');
  });

  it('rests with the perks when keeping everything is switched off, and comes back with them', async () => {
    const pip = await lapsedKeeper();
    let e = await entitlementsOf(env.DB, pip.id, Date.now(), { keepAll: false });
    expect(e.owned).not.toContain('houseboat');
    await tell(rcEvent(pip.id, 'RENEWAL', 'kf.patron.monthly'));
    e = await entitlementsOf(env.DB, pip.id, Date.now(), { keepAll: false });
    expect(e.owned).toContain('houseboat');
  });
});
