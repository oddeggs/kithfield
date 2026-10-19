import type { ChipIn } from '@kithfield/contracts';
import { localDay } from '@kithfield/farm';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, cast, plantFarm, type Person } from '../farm/support/doubles';
import { boughtConsumable, entitlements, holdClock } from './support';

beforeEach(() => {
  holdClock();
});

afterEach(() => {
  vi.useRealTimers();
});

const pledge = (person: Person, id: string, tier: string, transaction: string | null) =>
  api(person, 'POST', `/v1/chip-ins/${id}/pledges`, { tier, transaction });

/** Moves the held wall clock on by a second. */
const tick = () => {
  vi.setSystemTime(Date.now() + 1000);
};

/** A birthday gift chip-in started by pip, with fig's birthday today, that pip then leaves. */
const starterLeaves = async () => {
  const { pip, fig, bea, kit } = await cast('pip', 'fig', 'bea', 'kit');
  const { farm } = await plantFarm(pip, [fig, bea, kit]);
  await api(fig, 'PATCH', '/v1/me/profile', {
    birthday: localDay(Date.now(), 'Europe/London').slice(5),
  });
  const { chipIn } = (
    await api(pip, 'POST', `/v1/farms/${farm}/chip-ins`, {
      for: 'gift',
      to: fig.id,
      item: 'treehouse',
      wrap: 'plum',
    })
  ).body as ChipIn;
  const left = await api(pip, 'POST', `/v1/farms/${farm}/cmd`, {
    opId: '01a15200-0000-7000-8000-000000000001',
    kind: 'left',
    payload: {},
  });
  expect(left.body).toMatchObject({ result: 'ack' });
  return { farm, chipIn, fig, bea, kit };
};

const giftsOn = async (person: Person, farm: string) => {
  const events = await api(person, 'GET', `/v1/farms/${farm}/events?kinds=gift`);
  return (events.body as { events: { actor: string; payload: { with?: string[] } }[] }).events;
};

describe('the gift a covered chip-in owes the farm', () => {
  it('is written by the next paying pledger when the starter has left the farm', async () => {
    const { farm, chipIn, fig, bea, kit } = await starterLeaves();
    // kit promised first, but bea paid first: payment order decides who writes the gift.
    await pledge(kit, chipIn, 'kf.chipin.200', null);
    tick();
    await pledge(bea, chipIn, 'kf.chipin.300', null);
    tick();
    await pledge(bea, chipIn, 'kf.chipin.300', await boughtConsumable(bea, 'kf.chipin.300'));
    tick();
    await pledge(kit, chipIn, 'kf.chipin.200', await boughtConsumable(kit, 'kf.chipin.200'));

    const gifts = await giftsOn(bea, farm);
    expect(gifts).toHaveLength(1);
    expect(gifts[0]?.actor).toBe(bea.id);
    expect(gifts[0]?.payload.with).toEqual([kit.id]);
    expect((await entitlements(fig)).owned).toContain('treehouse');
    const row = await env.DB.prepare('SELECT delivered_at FROM chip_ins WHERE id = ?')
      .bind(chipIn)
      .first<{ delivered_at: number | null }>();
    expect(row?.delivered_at).not.toBeNull();
  });

  it('is written by the lesser person id when two pledgers paid at the same moment', async () => {
    const { farm, chipIn, bea, kit } = await starterLeaves();
    await pledge(bea, chipIn, 'kf.chipin.300', null);
    await pledge(kit, chipIn, 'kf.chipin.200', null);
    const beaPaid = await boughtConsumable(bea, 'kf.chipin.300');
    const kitPaid = await boughtConsumable(kit, 'kf.chipin.200');
    await pledge(bea, chipIn, 'kf.chipin.300', beaPaid);
    await pledge(kit, chipIn, 'kf.chipin.200', kitPaid);

    const [first, second] = [bea.id, kit.id].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const gifts = await giftsOn(bea, farm);
    expect(gifts).toHaveLength(1);
    expect(gifts[0]?.actor).toBe(first);
    expect(gifts[0]?.payload.with).toEqual([second]);
  });
});
