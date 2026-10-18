import { RESTORATION_RULES_VERSION, type ChipIn } from '@kithfield/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, cast, plantFarm, useTestPorts } from '../farm/support/doubles';
import { boughtConsumable } from './support';

beforeEach(() => {
  useTestPorts({ at: Date.now() });
});

describe('a covered farm theme on a farm whose rules are older than farm-written themes', () => {
  it('is the farm’s own, but waits for a keeper to switch it on', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    expect((await stub.state())?.rulesVersion).toBeLessThan(RESTORATION_RULES_VERSION);
    const { chipIn } = (
      await api(fig, 'POST', `/v1/farms/${farm}/chip-ins`, { for: 'theme', theme: 'cherry_valley' })
    ).body as ChipIn;
    for (const [who, tier] of [
      [fig, 'kf.chipin.500'],
      [pip, 'kf.chipin.500'],
    ] as const) {
      await api(who, 'POST', `/v1/chip-ins/${chipIn}/pledges`, { tier, transaction: null });
    }
    for (const [who, tier] of [
      [fig, 'kf.chipin.500'],
      [pip, 'kf.chipin.500'],
    ] as const) {
      await api(who, 'POST', `/v1/chip-ins/${chipIn}/pledges`, {
        tier,
        transaction: await boughtConsumable(who, tier),
      });
    }
    expect((await api(pip, 'GET', `/v1/farms/${farm}/themes`)).body).toEqual({
      owned: ['cherry_valley'],
      current: null,
    });
    const events = await api(pip, 'GET', `/v1/farms/${farm}/events?kinds=settings_changed`);
    expect((events.body as { events: unknown[] }).events).toEqual([]);
    // A keeper switches it on.
    const opId = '01a15100-0000-7000-8000-000000000001';
    const switched = await api(pip, 'POST', `/v1/farms/${farm}/cmd`, {
      opId,
      kind: 'settings_changed',
      payload: { setting: 'theme', theme: 'cherry_valley' },
    });
    expect(switched.body).toMatchObject({ result: 'ack' });
    expect((await stub.state())?.theme).toBe('cherry_valley');
  });
});
