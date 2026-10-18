import { RESTORATION_RULES_VERSION, type ChipIn, type ChipInList } from '@kithfield/contracts';
import { localDay } from '@kithfield/farm';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, cast, plantFarm, useTestPorts } from '../farm/support/doubles';
import { boughtConsumable, entitlements } from './support';

beforeEach(() => {
  useTestPorts({ at: Date.now() });
});

const pledge = (
  person: Parameters<typeof api>[0],
  id: string,
  tier: string,
  transaction: string | null,
) => api(person, 'POST', `/v1/chip-ins/${id}/pledges`, { tier, transaction });

describe('a farm theme chip-in', () => {
  it('fills from promises, is paid once covered, and is the farm’s for good', async () => {
    const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
    const { farm, stub } = await plantFarm(pip, [fig, bea]);
    const started = await api(fig, 'POST', `/v1/farms/${farm}/chip-ins`, {
      for: 'theme',
      theme: 'snowy_hollow',
    });
    expect(started.status).toBe(200);
    const { chipIn } = started.body as ChipIn;

    let view = (await pledge(fig, chipIn, 'kf.chipin.500', null)).body as ChipIn;
    expect(view).toMatchObject({
      state: 'open',
      people: [fig.id],
      mine: { tier: 'kf.chipin.500', state: 'promised' },
    });
    expect(view.filled).toBeCloseTo(500 / 999);
    expect(JSON.stringify(view)).not.toContain('"value"');

    view = (await pledge(bea, chipIn, 'kf.chipin.500', null)).body as ChipIn;
    expect(view.state).toBe('covered');
    expect(view.filled).toBe(1);
    expect(view.closesAt).not.toBeNull();

    // Each pays their share; once paid covers it, the farm switches the theme on.
    await pledge(fig, chipIn, 'kf.chipin.500', await boughtConsumable(fig, 'kf.chipin.500'));
    expect((await stub.state())?.theme).toBeNull();
    view = (
      await pledge(bea, chipIn, 'kf.chipin.500', await boughtConsumable(bea, 'kf.chipin.500'))
    ).body as ChipIn;
    expect(view.mine?.state).toBe('paid');
    // The farm switches it on itself from the rules that brought farm-written themes.
    const state = await stub.state();
    const shown = (state?.rulesVersion ?? 0) >= RESTORATION_RULES_VERSION ? 'snowy_hollow' : null;
    expect(state?.theme ?? null).toBe(shown);
    const themes = await api(pip, 'GET', `/v1/farms/${farm}/themes`);
    expect(themes.body).toEqual({ owned: ['snowy_hollow'], current: shown });
    // Owned now: no second chip-in for it.
    expect(
      (
        await api(pip, 'POST', `/v1/farms/${farm}/chip-ins`, {
          for: 'theme',
          theme: 'snowy_hollow',
        })
      ).status,
    ).toBe(409);
  });

  it('closes uncovered: promises released, nothing charged', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const { chipIn } = (
      await api(fig, 'POST', `/v1/farms/${farm}/chip-ins`, { for: 'theme', theme: 'seaside_cove' })
    ).body as ChipIn;
    await pledge(fig, chipIn, 'kf.chipin.200', null);
    await env.DB.prepare('UPDATE chip_ins SET closes_at = ? WHERE id = ?')
      .bind(Date.now() - 1, chipIn)
      .run();
    const list = (await api(fig, 'GET', `/v1/farms/${farm}/chip-ins`)).body as ChipInList;
    expect(list.chipIns.find((c) => c.chipIn === chipIn)).toBeUndefined();
    const row = await env.DB.prepare('SELECT state FROM pledges WHERE chip_in_id = ?')
      .bind(chipIn)
      .first<{ state: string }>();
    expect(row?.state).toBe('released');
  });
});

describe('a birthday chip-in', () => {
  it('is hidden from the friend it is for, and leaves the gift on their step from the starter', async () => {
    const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
    const { farm, stub } = await plantFarm(pip, [fig, bea]);
    const today = localDay(Date.now(), 'Europe/London');
    expect((await api(fig, 'PATCH', '/v1/me/profile', { birthday: today.slice(5) })).status).toBe(
      200,
    );

    const started = await api(pip, 'POST', `/v1/farms/${farm}/chip-ins`, {
      for: 'gift',
      to: fig.id,
      item: 'treehouse',
      wrap: 'fern',
      note: 'happy birthday',
    });
    expect(started.status).toBe(200);
    const { chipIn, closesAt } = started.body as ChipIn;
    expect(closesAt).toBeGreaterThan(Date.now());

    expect(
      ((await api(fig, 'GET', `/v1/farms/${farm}/chip-ins`)).body as ChipInList).chipIns,
    ).toEqual([]);
    expect((await pledge(fig, chipIn, 'kf.chipin.500', null)).status).toBe(404);

    // Not her birthday: no chip-in for Bea.
    expect(
      (
        await api(pip, 'POST', `/v1/farms/${farm}/chip-ins`, {
          for: 'gift',
          to: bea.id,
          item: 'treehouse',
          wrap: 'fern',
        })
      ).status,
    ).toBe(409);

    await pledge(pip, chipIn, 'kf.chipin.300', await boughtConsumable(pip, 'kf.chipin.300'));
    const done = (
      await pledge(bea, chipIn, 'kf.chipin.200', await boughtConsumable(bea, 'kf.chipin.200'))
    ).body as ChipIn;
    expect(done.state).toBe('covered');
    expect((await entitlements(fig)).owned).toContain('treehouse');
    const step = (await stub.state())?.doorstep.find((d) => d.kind === 'gift' && d.to === fig.id);
    expect(step?.from).toBe(pip.id);
    const events = await api(pip, 'GET', `/v1/farms/${farm}/events?kinds=gift`);
    const gift = (events.body as { events: { actor: string; payload: Record<string, unknown> }[] })
      .events[0];
    expect(gift?.actor).toBe(pip.id);
    expect(gift?.payload).toMatchObject({
      action: 'given',
      chipIn,
      with: [bea.id],
      note: 'happy birthday',
    });
  });
});
