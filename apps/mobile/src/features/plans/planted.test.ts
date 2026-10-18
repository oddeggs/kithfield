import { afterEach, describe, expect, it } from '@jest/globals';
import type { SeedPlantedPayload } from '@kithfield/contracts';

import { kithfieldRules } from '../../data/farm-rules';
import { FarmTestServer } from '../../data/test/farm-test-server';
import { FAST, TestPhone, until } from '../../data/test/test-phone';
import { memoryPlantedStore, plantAndJoin, settlePlanted } from './planted';

const FARM = 'f_lot';
const BEA = 'p_bea';
const PIP = 'p_pip';

const phones: TestPhone[] = [];
afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

const picnic: SeedPlantedPayload = {
  title: 'Picnic by the river',
  days: [{ date: '2026-10-24' }],
  place: { name: 'Willow bend' },
  yeses: 'couple',
  someday: false,
};

async function setup() {
  const server = new FarmTestServer(kithfieldRules);
  server.createFarm(FARM, BEA, 'The Lot');
  server.join(FARM, PIP);
  const pip = await TestPhone.start(server, PIP, FAST);
  phones.push(pip);
  pip.client.hold(FARM);
  await until(() => pip.client.link(FARM).status === 'live');
  return { server, pip };
}

/** The planter's answers on the server's copy of the farm. */
const answersOn = (server: FarmTestServer) =>
  server
    .farmOf(FARM)
    .log.filter((e) => e['kind'] === 'rsvp')
    .map((e) => [e['actor'], (e['payload'] as { answer: string }).answer]);

describe("the planter's own yes", () => {
  it('is said once the farm has numbered the plan', async () => {
    const { server, pip } = await setup();
    const store = memoryPlantedStore();
    expect((await plantAndJoin(pip.client, store, FARM, PIP, picnic)).status).toBe('queued');
    await until(async () => (await settlePlanted(pip.client, store, PIP)) === 0);
    await until(() => answersOn(server).length === 1);
    expect(answersOn(server)).toEqual([[PIP, 'in']]);
    // Settling again sends nothing more.
    await settlePlanted(pip.client, store, PIP);
    await until(async () => (await pip.state(FARM)).pending.length === 0);
    expect(answersOn(server)).toEqual([[PIP, 'in']]);
  });

  it('is still said after the app is closed before the farm numbered the plan', async () => {
    const { server, pip } = await setup();
    const store = memoryPlantedStore();
    pip.appState.set('background');
    await until(() => pip.client.link(FARM).status === 'paused');
    // Planted with the socket paused, then the app is killed: the note stays on disk.
    await plantAndJoin(pip.client, store, FARM, PIP, picnic);
    expect((await pip.state(FARM)).pending).toHaveLength(1);
    expect(await store.read()).toHaveLength(1);
    await pip.restart();
    pip.appState.set('active');
    pip.client.hold(FARM);
    await until(() => pip.client.link(FARM).status === 'live');
    await until(async () => (await settlePlanted(pip.client, store, PIP)) === 0);
    await until(() => answersOn(server).length === 1);
    expect(answersOn(server)).toEqual([[PIP, 'in']]);
  });

  it('forgets a planting the farm never takes', async () => {
    const { pip } = await setup();
    const store = memoryPlantedStore();
    const week = 7 * 24 * 3_600_000;
    await store.write([{ person: PIP, farm: FARM, opId: '01890000-0000-7000-8000-000000000000', at: 0 }]);
    expect(await settlePlanted(pip.client, store, PIP, 5 * week)).toBe(0);
  });
});
