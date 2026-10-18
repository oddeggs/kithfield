import { afterEach, describe, expect, it } from '@jest/globals';

import { FarmTestServer } from './test/farm-test-server';
import { testFarmRules } from './test/test-farm-rules';
import { TestPhone, until } from './test/test-phone';

const FARM = 'f_lot';
const BEA = 'p_bea';
const PIP = 'p_pip';

const phones: TestPhone[] = [];

function setup() {
  const server = new FarmTestServer(testFarmRules);
  server.createFarm(FARM, BEA, 'The Lot');
  server.join(FARM, PIP);
  const start = async (person: string) => {
    const phone = await TestPhone.start(server, person);
    phones.push(phone);
    return phone;
  };
  return { server, start };
}

const live = (phone: TestPhone) => () => phone.client.link(FARM).status === 'live';

afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

describe('catching up', () => {
  it('takes the snapshot when it holds nothing, then stays live', async () => {
    const { server, start } = setup();
    const bea = await start(BEA);
    bea.client.hold(FARM);
    await until(live(bea));

    const state = await bea.state(FARM);
    expect(state.lastSeq).toBe(server.farmOf(FARM).log.length);
    expect(state.confirmed).toEqual(server.farmOf(FARM).state);
    expect(server.hellos.at(-1)).toMatchObject({ protocol: 1, lastSeq: 0, rulesVersion: 1 });
  });

  it('catches up by events in batches of 200 after being away, without a snapshot', async () => {
    const { server, start } = setup();
    const bea = await start(BEA);
    const pip = await start(PIP);
    bea.client.hold(FARM);
    pip.client.hold(FARM);
    await until(live(bea));
    await until(live(pip));

    // Pip goes into the background; Bea writes 250 messages meanwhile.
    pip.appState.set('background');
    await until(() => pip.client.link(FARM).status === 'paused');
    for (let i = 0; i < 250; i += 1) {
      await bea.client.send(FARM, 'message', { text: `note ${i}` });
    }
    await until(async () => (await bea.state(FARM)).pending.length === 0);

    const snapshotsBefore = server.framesOf('snapshot').length;
    pip.appState.set('active');
    await until(async () => (await pip.state(FARM)).lastSeq === server.farmOf(FARM).log.length);

    expect(server.framesOf('snapshot')).toHaveLength(snapshotsBefore);
    const batches = server.framesOf('events').slice(-2);
    expect(batches.map((b) => (b['events'] as unknown[]).length)).toEqual([200, 50]);
    expect(batches.map((b) => b['more'])).toEqual([true, false]);
    expect((await pip.state(FARM)).confirmed).toEqual(server.farmOf(FARM).state);
    const cached = await pip.client.events(FARM, { limit: 3 });
    expect(cached.map((e) => e.payload)).toEqual([
      { text: 'note 247' },
      { text: 'note 248' },
      { text: 'note 249' },
    ]);
  });

  it('gets a snapshot when it is more than 500 events behind', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    pip.appState.set('background');
    for (let i = 0; i < 501; i += 1) server.write(FARM, BEA, 'dewdrop', {});
    const snapshotsBefore = server.framesOf('snapshot').length;

    pip.appState.set('active');
    await until(async () => (await pip.state(FARM)).lastSeq === server.farmOf(FARM).log.length);
    expect(server.framesOf('snapshot')).toHaveLength(snapshotsBefore + 1);
    expect(server.hellos.at(-1)?.['lastSeq']).toBeGreaterThan(0);
    expect((await pip.state(FARM)).confirmed).toEqual(server.farmOf(FARM).state);
  });

  it('reconnects with back-off after the network drops, and picks up what it missed', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    server.online = false;
    server.dropAll();
    await until(() => {
      const link = pip.client.link(FARM);
      return link.status === 'offline' && link.attempt >= 3;
    });
    server.write(FARM, BEA, 'wave', { to: PIP });
    server.online = true;

    await until(async () => (await pip.state(FARM)).lastSeq === server.farmOf(FARM).log.length);
    await until(live(pip));
    expect((await pip.state(FARM)).confirmed).toEqual(server.farmOf(FARM).state);
  });
});

describe('two phones chatting', () => {
  it('sees each other’s messages live, and both match the farm', async () => {
    const { server, start } = setup();
    const bea = await start(BEA);
    const pip = await start(PIP);
    bea.client.hold(FARM);
    pip.client.hold(FARM);
    await until(live(bea));
    await until(live(pip));

    await bea.client.send(FARM, 'message', { text: 'who is coming saturday?' });
    await until(async () => (await pip.state(FARM)).lastSeq === server.farmOf(FARM).log.length);
    await pip.client.send(FARM, 'message', { text: 'me!' });
    await until(async () => (await bea.state(FARM)).lastSeq === server.farmOf(FARM).log.length);
    await until(async () => (await pip.state(FARM)).pending.length === 0);

    const texts = async (phone: TestPhone) =>
      (await phone.client.events(FARM, { limit: 2 })).map((e) => [e.actor, e.payload]);
    const expected = [
      [BEA, { text: 'who is coming saturday?' }],
      [PIP, { text: 'me!' }],
    ];
    expect(await texts(bea)).toEqual(expected);
    expect(await texts(pip)).toEqual(expected);
    expect((await bea.state(FARM)).confirmed).toEqual(server.farmOf(FARM).state);
    expect((await pip.state(FARM)).confirmed).toEqual(server.farmOf(FARM).state);
  });

  it('shares presence and typing without storing them', async () => {
    const { start } = setup();
    const bea = await start(BEA);
    const pip = await start(PIP);
    bea.client.hold(FARM);
    pip.client.hold(FARM);
    await until(live(bea));
    await until(live(pip));
    await until(async () => (await bea.state(FARM)).presence.includes(PIP));

    const pipConnection = pip.client;
    pipConnection.typing(FARM, true);
    await until(async () => (await bea.state(FARM)).typing.includes(PIP));
  });
});
