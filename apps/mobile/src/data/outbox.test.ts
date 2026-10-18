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
const head = (server: FarmTestServer) => server.farmOf(FARM).log.length;
const eventsWithOp = (server: FarmTestServer, opId: string) =>
  server.farmOf(FARM).log.filter((e) => e['opId'] === opId);

afterEach(() => {
  for (const phone of phones.splice(0)) phone.stop();
});

describe('writing', () => {
  it('draws a write at once, then reconciles it with the farm’s event', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    const sent = await pip.client.send(FARM, 'message', { text: 'on my way' });
    expect(sent.status).toBe('queued');
    const drawn = await pip.state(FARM);
    expect(drawn.pending).toHaveLength(1);
    expect(drawn.confirmed?.familyTendedAt.words).toBeNull();
    expect(drawn.state?.familyTendedAt.words).not.toBeNull();

    await until(async () => (await pip.state(FARM)).pending.length === 0);
    const settled = await pip.state(FARM);
    expect(settled.state).toEqual(settled.confirmed);
    expect(settled.confirmed).toEqual(server.farmOf(FARM).state);
    // The farm broadcast the event before it acknowledged it.
    const frames = server.sentFrames.map((f) => f.frame['type']);
    expect(frames.lastIndexOf('event')).toBeLessThan(frames.lastIndexOf('ack'));
  });

  it('refuses a write the shared rules already say the farm would refuse', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));
    server.write(FARM, null, 'settings_changed', { setting: 'frozen', on: true });
    await until(async () => (await pip.state(FARM)).lastSeq === head(server));

    expect(await pip.client.send(FARM, 'wave', { to: BEA })).toEqual({
      status: 'refused',
      reason: 'farm_frozen',
    });
    expect((await pip.state(FARM)).pending).toHaveLength(0);
  });

  it('drops a write the farm rejects, keeps the reason, and stays rejected on a retry', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    // The farm is frozen while Pip's phone is in the background, so the phone doesn't know yet.
    pip.appState.set('background');
    server.write(FARM, null, 'settings_changed', { setting: 'frozen', on: true });
    const sent = await pip.client.send(FARM, 'wave', { to: BEA });
    if (sent.status !== 'queued') throw new Error('expected the write to queue');

    pip.appState.set('active');
    await until(() => pip.client.rejections().length === 1);
    expect(pip.client.rejections()[0]).toMatchObject({
      opId: sent.opId,
      farm: FARM,
      kind: 'wave',
      reason: 'farm_frozen',
    });
    const after = await pip.state(FARM);
    expect(after.pending).toHaveLength(0);
    expect(after.state).toEqual(after.confirmed);
    expect(eventsWithOp(server, sent.opId)).toHaveLength(0);

    // Asked again with the same op id, the farm gives the same answer.
    const again = server.command(FARM, PIP, {
      opId: sent.opId,
      kind: 'wave',
      payload: { to: BEA },
    });
    expect(again).toEqual({ result: 'rejected', opId: sent.opId, reason: 'farm_frozen' });

    // The rejection survives a restart until the app has explained it.
    await pip.restart();
    expect(pip.client.rejections()).toHaveLength(1);
    await pip.client.dismissRejection(sent.opId);
    expect(pip.client.rejections()).toHaveLength(0);
  });

  it('a write applied but unanswered is sent again with its op id and applied once', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    // The farm applies the write, then the network goes before the event or ack arrives, and the
    // socket can't come back.
    server.loseAnswers = true;
    server.acceptSockets = false;
    const sent = await pip.client.send(FARM, 'message', { text: 'did this send?' });
    if (sent.status !== 'queued') throw new Error('expected the write to queue');
    await until(() => eventsWithOp(server, sent.opId).length === 1);
    const appliedAt = Number(eventsWithOp(server, sent.opId)[0]?.['seq']);
    server.loseAnswers = false;

    // So the outbox goes out over HTTP, with the same op id.
    await until(() => server.httpCommands.includes(sent.opId));
    await until(async () => (await pip.state(FARM)).pending.length === 0);

    expect(eventsWithOp(server, sent.opId)).toHaveLength(1);
    const state = await pip.state(FARM);
    expect(state.lastSeq).toBe(appliedAt);
    expect(state.confirmed).toEqual(server.farmOf(FARM).state);
  });
});

describe('the outbox across restarts and outages', () => {
  it('replays writes made offline after the app is killed and relaunched', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    server.online = false;
    server.dropAll();
    const first = await pip.client.send(FARM, 'message', { text: 'written on the train' });
    const second = await pip.client.send(FARM, 'dewdrop', {});
    if (first.status !== 'queued' || second.status !== 'queued') throw new Error('expected queued');
    expect((await pip.state(FARM)).state?.familyTendedAt.dew).not.toBeNull();

    await pip.restart();
    // Back on the same file: the writes are still there and still drawn.
    const reopened = await pip.state(FARM);
    expect(reopened.pending.map((p) => p.opId)).toEqual([first.opId, second.opId]);
    expect(reopened.state?.familyTendedAt.dew).not.toBeNull();

    server.online = true;
    pip.client.hold(FARM);
    await until(async () => (await pip.state(FARM)).pending.length === 0);
    const log = server.farmOf(FARM).log;
    expect(log.slice(-2).map((e) => e['opId'])).toEqual([first.opId, second.opId]);
    expect((await pip.state(FARM)).confirmed).toEqual(server.farmOf(FARM).state);
  });

  it('sends over HTTP when the socket can’t connect, then catches up over HTTP', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    pip.client.hold(FARM);
    await until(live(pip));

    server.acceptSockets = false;
    server.dropAll();
    server.write(FARM, BEA, 'wave', { to: PIP });
    const sent = await pip.client.send(FARM, 'message', { text: 'socket is down' });
    if (sent.status !== 'queued') throw new Error('expected the write to queue');

    await until(async () => (await pip.state(FARM)).lastSeq === head(server));
    expect(server.httpCommands).toEqual([sent.opId]);
    const state = await pip.state(FARM);
    expect(state.pending).toHaveLength(0);
    expect(state.confirmed).toEqual(server.farmOf(FARM).state);
  });

  it('sends writes for a farm that isn’t open over HTTP straight away', async () => {
    const { server, start } = setup();
    const pip = await start(PIP);
    const sent = await pip.client.send(FARM, 'wave', { to: BEA });
    if (sent.status !== 'queued') throw new Error('expected the write to queue');
    await until(() => eventsWithOp(server, sent.opId).length === 1);
    await until(async () => (await pip.state(FARM)).pending.length === 0);
  });
});
