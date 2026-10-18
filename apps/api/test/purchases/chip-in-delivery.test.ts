import type { ChipIn } from '@kithfield/contracts';
import { localDay } from '@kithfield/farm';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, cast, plantFarm, type Person, useTestPorts } from '../farm/support/doubles';
import { boughtConsumable, entitlements } from './support';

beforeEach(() => {
  useTestPorts({ at: Date.now() });
});

const pledge = (person: Person, id: string, tier: string, transaction: string | null) =>
  api(person, 'POST', `/v1/chip-ins/${id}/pledges`, { tier, transaction });

describe('the gift a covered chip-in owes the farm', () => {
  it('is written by the next paying pledger when the starter has left the farm', async () => {
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
    await pledge(bea, chipIn, 'kf.chipin.300', null);
    await pledge(kit, chipIn, 'kf.chipin.200', null);
    const left = await api(pip, 'POST', `/v1/farms/${farm}/cmd`, {
      opId: '01a15200-0000-7000-8000-000000000001',
      kind: 'left',
      payload: {},
    });
    expect(left.body).toMatchObject({ result: 'ack' });
    await pledge(bea, chipIn, 'kf.chipin.300', await boughtConsumable(bea, 'kf.chipin.300'));
    await pledge(kit, chipIn, 'kf.chipin.200', await boughtConsumable(kit, 'kf.chipin.200'));

    const events = await api(bea, 'GET', `/v1/farms/${farm}/events?kinds=gift`);
    const gifts = (events.body as { events: { actor: string; payload: { with?: string[] } }[] })
      .events;
    expect(gifts).toHaveLength(1);
    expect(gifts[0]?.actor).toBe(bea.id);
    expect(gifts[0]?.payload.with).toEqual([kit.id]);
    expect((await entitlements(fig)).owned).toContain('treehouse');
    const row = await env.DB.prepare('SELECT delivered_at FROM chip_ins WHERE id = ?')
      .bind(chipIn)
      .first<{ delivered_at: number | null }>();
    expect(row?.delivered_at).not.toBeNull();
  });
});
