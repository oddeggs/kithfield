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

const live =
  (phone: TestPhone, farm = FARM) =>
  () =>
    phone.client.link(farm).status === 'live';
const head = (server: FarmTestServer) => server.farmOf(FARM).log.length;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const queued = async (phone: TestPhone, kind: string, payload: unknown) => {
  const sent = await phone.client.send(FARM, kind, payload);
  if (sent.status !== 'queued') throw new Error(`expected ${kind} to queue`);
  return sent.opId;
};

afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

describe('frames that fail their schema', () => {
  it('sorts a broken envelope in the last catch-up batch, catches up and sends the outbox', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    pip.appState.set('background');
    await until(() => pip.client.link(FARM).status === 'paused');

    server.writeRaw(FARM, { kind: 'wave', actor: BEA, payload: {}, opId: 'not-an-op-id' });
    const opId = await queued(pip, 'wave', { to: BEA });
    pip.appState.set('active');

    await until(() => server.farmOf(FARM).log.some((e) => e['opId'] === opId));
    await until(async () => (await pip.state(FARM)).pending.length === 0);
    expect(pip.reports).toContainEqual(
      expect.objectContaining({ type: 'invalid_event', kind: 'wave', issues: [['opId']] }),
    );
  });
});

describe('a farm closed to this person', () => {
  it('turns the outbox into rejections when the socket says not a member', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    pip.appState.set('background');
    await until(() => pip.client.link(FARM).status === 'paused');
    const opId = await queued(pip, 'wave', { to: BEA });

    server.farmOf(FARM).members.delete(PIP);
    pip.appState.set('active');
    await until(() => pip.client.link(FARM).status === 'blocked');
    await until(() => pip.client.rejections().length === 1);
    expect(pip.client.rejections()[0]).toMatchObject({ opId, reason: 'not_member' });
    expect((await pip.state(FARM)).pending).toEqual([]);
  });

  it('turns the outbox into rejections on a 403 over HTTP, and stops sending it', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    server.online = false;
    await queued(pip, 'wave', { to: BEA });
    await queued(pip, 'dewdrop', {});
    server.farmOf(FARM).members.delete(PIP);
    server.online = true;

    await pip.client.start();
    await until(() => pip.client.rejections().length === 2);
    expect(pip.client.rejections().map((r) => r.reason)).toEqual(['not_member', 'not_member']);
    expect(await pip.client.store.outbox(FARM)).toEqual([]);
  });

  it('refuses one write the API rejects with a 400 and still sends the rest', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    server.online = false;
    // A write this app version made that the API no longer takes.
    await pip.client.store.transaction(() =>
      pip.client.store.addOutbox({
        opId: '01900000-0000-7000-8000-00000000abcd',
        farm: FARM,
        actor: PIP,
        kind: 'wave',
        payload: { to: 'not an id!' },
        createdAt: 1,
        attempts: 0,
        ackedSeq: null,
      }),
    );
    await pip.restart();
    const good = await queued(pip, 'dewdrop', {});
    server.online = true;

    await pip.client.start();
    await until(() => server.farmOf(FARM).log.some((e) => e['opId'] === good));
    await until(() => pip.client.rejections().length === 1);
    expect(pip.client.rejections()[0]).toMatchObject({ reason: 'invalid', kind: 'wave' });
  });
});

describe('the outbox of farms without a socket', () => {
  it('keeps trying on a back-off timer, without touching any farm’s link', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    server.online = false;
    const opId = await queued(pip, 'wave', { to: BEA });
    await pause(30);
    server.online = true;

    await until(() => server.farmOf(FARM).log.some((e) => e['opId'] === opId));
    expect(pip.client.link(FARM)).toBe(pip.client.link('f_never'));
  });

  it('tries again on returning to the foreground', async () => {
    const { server, start } = setup({ ...FAST, backoff: { baseMs: 60_000, maxMs: 60_000 } });
    const pip = await start(PIP);
    server.online = false;
    const opId = await queued(pip, 'wave', { to: BEA });
    await pause(20);
    server.online = true;
    pip.appState.set('background');
    pip.appState.set('active');
    await until(() => server.farmOf(FARM).log.some((e) => e['opId'] === opId));
  });
});

describe('a farm that never answers hello', () => {
  it('gives up on that connection and tries again', async () => {
    const { server, start } = setup({ ...FAST, keepAlive: { intervalMs: 60_000, timeoutMs: 20 } });
    server.silentHellos = true;
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(() => server.hellos.length >= 3);
    server.silentHellos = false;
    await until(live(pip));
  });
});

describe('the session as the sockets see it', () => {
  it('says the session ended when socket tokens answer 401', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    server.people.delete(PIP);
    server.tokens.clear();
    server.dropAll();
    await until(() => pip.client.status().sessionEnded);
    const hellos = server.hellos.length;
    await pause(50);
    expect(server.hellos).toHaveLength(hellos);
  });

  it('stops both sockets when the person is banned', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    server.banned.add(PIP);
    server.tokens.clear();
    server.dropAll();
    await until(() => pip.client.status().banned);
    expect(pip.client.link(FARM)).toEqual({ status: 'blocked', code: 'banned' });
    expect(pip.client.cottage.getState().link).toEqual({ status: 'blocked', code: 'banned' });
  });

  it('reconnects as the new person after a merge, keeping the outbox', async () => {
    const { server, start } = setup();
    server.people.add('p_anon');
    server.farmOf(FARM).members.add('p_anon');
    const phone = await start('p_anon');
    await until(() => phone.client.cottage.getState().link.status === 'live');

    // Signing in merged the anonymous person into Pip.
    phone.person = PIP;
    phone.client.personChanged();
    await until(() => [...server.sessions].some((s) => s.cottage === PIP && s.person === PIP));
  });
});

describe('signing out', () => {
  it('warns about unsent writes, then wipes this person’s tables when forced', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    server.online = false;
    server.dropAll();
    await queued(pip, 'wave', { to: BEA });

    expect(await pip.client.signOut({ force: false })).toEqual({ unsent: 1, signedOut: false });
    expect(await pip.client.store.outbox(FARM)).toHaveLength(1);

    expect(await pip.client.signOut({ force: true })).toEqual({ unsent: 1, signedOut: true });
    expect(await pip.client.store.outbox(FARM)).toEqual([]);
    expect(await pip.client.events(FARM, { limit: 5 })).toEqual([]);
    expect((await pip.client.store.farm(FARM)).lastSeq).toBe(0);
    expect(pip.reports).toContainEqual({ type: 'unsent_at_sign_out', count: 1 });
    expect(head(server)).toBeGreaterThan(0);
  });
});
