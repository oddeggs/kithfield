import { afterEach, describe, expect, it } from '@jest/globals';

import { FarmTestServer } from './test/farm-test-server';
import { testFarmRules } from './test/test-farm-rules';
import { FAST, TestPhone, until } from './test/test-phone';

const FARM = 'f_lot';
const BEA = 'p_bea';
const PIP = 'p_pip';

const phones: TestPhone[] = [];

function setup(tuning = FAST) {
  const server = new FarmTestServer(testFarmRules);
  server.createFarm(FARM, BEA, 'The Lot');
  server.join(FARM, PIP);
  const start = async (person: string) => {
    const phone = await TestPhone.start(server, person, tuning);
    phones.push(phone);
    return phone;
  };
  return { server, start };
}

const live = (phone: TestPhone) => () => phone.client.link(FARM).status === 'live';
const head = (server: FarmTestServer) => server.farmOf(FARM).log.length;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

describe('sorting received events', () => {
  it('keeps an unknown kind, steps past it and leaves the farm as it was', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    const before = (await pip.state(FARM)).confirmed;

    server.writeRaw(FARM, { kind: 'lantern_song', actor: BEA, payload: { tune: 3 } });
    await until(async () => (await pip.state(FARM)).lastSeq === head(server));

    const [stored] = await pip.client.events(FARM, { limit: 1 });
    expect(stored).toMatchObject({ kind: 'lantern_song', known: false, payload: { tune: 3 } });
    expect((await pip.state(FARM)).confirmed).toEqual(before);
    expect(pip.reports).toEqual([]);
  });

  it('keeps an invalid event raw, reports it without content, and takes the snapshot', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    const snapshots = server.framesOf('snapshot').length;

    server.writeRaw(FARM, { kind: 'message', actor: BEA, payload: { text: 42 } });
    const bad = head(server);
    await until(() => server.framesOf('snapshot').length === snapshots + 1);
    await until(live(pip));

    expect(pip.reports).toEqual([
      {
        type: 'invalid_event',
        farm: FARM,
        seq: bad,
        kind: 'message',
        issues: [['payload', 'text']],
      },
    ]);
    expect(JSON.stringify(pip.reports)).not.toContain('42');
    expect(server.hellos.at(-1)?.['lastSeq']).toBe(0);
    const invalid = await pip.client.store.invalidEvents(FARM);
    expect(invalid).toEqual([
      expect.objectContaining({
        seq: bad,
        kind: 'message',
        raw: expect.objectContaining({ payload: { text: 42 } }),
      }),
    ]);
    const state = await pip.state(FARM);
    expect(state.lastSeq).toBe(head(server));
    expect(state.confirmed).toEqual(server.farmOf(FARM).state);

    // Settled: the next connection says hello from where it is.
    await pip.restart();
    pip.client.hold(FARM);
    await until(live(pip));
    expect(server.hellos.at(-1)?.['lastSeq']).toBe(head(server));
  });

  it('tombstones its copy of an unsent message', async () => {
    const { server, start } = setup();
    const bea = await start(BEA);
    const pip = await start(PIP);
    bea.client.hold(FARM);
    pip.client.hold(FARM);
    await until(live(bea));
    await until(live(pip));

    const synced = async () =>
      (await bea.state(FARM)).pending.length === 0 &&
      (await pip.state(FARM)).lastSeq === head(server);
    await bea.client.send(FARM, 'message', { text: 'oops, wrong farm' });
    await until(synced);
    const target = head(server);
    await bea.client.send(FARM, 'unsend', { target });
    await until(synced);

    const copy = await pip.client.store.event(FARM, target);
    expect(copy?.payload).toEqual({ tombstone: 'unsent' });
    expect(JSON.stringify(copy)).not.toContain('wrong farm');
  });
});

describe('history', () => {
  it('pages older events into the cache after a snapshot, sorted like live ones', async () => {
    const { server, start } = setup();
    server.write(FARM, BEA, 'message', { text: 'first light' });
    server.writeRaw(FARM, { kind: 'lantern_song', actor: BEA, payload: {} });
    server.write(FARM, PIP, 'message', { text: 'morning!' });
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    expect(await pip.client.events(FARM, { limit: 10 })).toEqual([]);

    expect(await pip.client.pageHistory(FARM, head(server) + 1, 3)).toBe(true);
    const page = await pip.client.events(FARM, { limit: 10 });
    expect(page.map((e) => [e.kind, e.known])).toEqual([
      ['message', true],
      ['lantern_song', false],
      ['message', true],
    ]);
  });

  it('brings back an event an appeal restored', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    const message = server.write(FARM, BEA, 'message', { text: 'a fair point' });
    server.write(FARM, null, 'unsend', { target: message.seq, by: 'safety' });
    await until(async () => (await pip.state(FARM)).lastSeq === head(server));
    expect((await pip.client.store.event(FARM, message.seq))?.payload).toEqual({
      tombstone: 'removed',
    });

    server.write(FARM, null, 'restored', { target: message.seq });
    await until(
      async () =>
        !('tombstone' in Object((await pip.client.store.event(FARM, message.seq))?.payload)),
    );
    expect((await pip.client.store.event(FARM, message.seq))?.payload).toEqual({
      text: 'a fair point',
    });
  });
});

describe('socket errors', () => {
  it('stops and keeps its outbox when the farm needs newer rules', async () => {
    const { server, start } = setup();
    server.farmOf(FARM).rulesVersion = 3;
    const pip = await start(PIP);
    await pip.client.send(FARM, 'wave', { to: BEA });
    pip.client.hold(FARM);

    await until(() => pip.client.link(FARM).status === 'blocked');
    expect(pip.client.link(FARM)).toEqual({ status: 'blocked', code: 'rules_outdated' });
    const hellos = server.hellos.length;
    await pause(60);
    expect(server.hellos).toHaveLength(hellos);
    expect((await pip.state(FARM)).pending).toHaveLength(1);
  });

  it('fetches a new token and says hello again after unauthorized', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    // Every token the farm issued stops working; the phone's cached one is now refused.
    server.tokens.clear();
    server.dropAll();
    await until(() => server.framesOf('error').some((f) => f['code'] === 'unauthorized'));
    await until(live(pip));
    // One fresh token for the farm (and one for the cottage, which was refused too).
    expect([...server.tokens.values()].filter((t) => t.farm === FARM)).toHaveLength(1);
  });

  it('stops for good when the person is not a member', async () => {
    const { server, start } = setup();
    server.people.add('p_fig');
    server.farmOf(FARM).members.add('p_fig');
    const fig = await start('p_fig');
    fig.client.hold(FARM);
    await until(live(fig));

    // Removed while connected: the next hello is refused.
    server.farmOf(FARM).members.delete('p_fig');
    server.dropAll();
    await until(() => fig.client.link(FARM).status === 'blocked');
    expect(fig.client.link(FARM)).toEqual({ status: 'blocked', code: 'not_member' });
  });
});

describe('keeping alive', () => {
  const quick = { ...FAST, keepAlive: { intervalMs: 15, timeoutMs: 15 } };

  it('stays connected while pings are answered', async () => {
    const { server, start } = setup(quick);
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    const hellos = server.hellos.length;
    await pause(120);
    expect(server.hellos).toHaveLength(hellos);
  });

  it('calls a silent socket dead and reconnects', async () => {
    const { server, start } = setup(quick);
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    const hellos = server.hellos.length;

    server.answerPings = false;
    await until(() => server.hellos.length > hellos);
    server.answerPings = true;
    await until(live(pip));
  });
});

describe('background and foreground', () => {
  it('closes the farm socket in the background and catches up on return', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    pip.appState.set('background');
    await until(() => [...server.sessions].every((s) => s.farm !== FARM));
    expect(pip.client.link(FARM).status).toBe('paused');
    server.write(FARM, BEA, 'hug', { to: PIP });

    pip.appState.set('active');
    await until(async () => (await pip.state(FARM)).lastSeq === head(server));
  });

  it('opens one farm socket at a time, the farm held last', async () => {
    const { server, start } = setup();
    server.createFarm('f_book', BEA, 'Book club');
    server.join('f_book', PIP);
    const pip = await start(PIP);
    const releaseLot = pip.client.hold(FARM);
    await until(live(pip));
    const releaseBook = pip.client.hold('f_book');
    await until(() => pip.client.link('f_book').status === 'live');
    expect([...server.sessions].filter((s) => s.farm !== null).map((s) => s.farm)).toEqual([
      'f_book',
    ]);

    releaseBook();
    await until(live(pip));
    releaseLot();
    await until(() => pip.client.link(FARM).status === 'stopped');
  });
});
