import { CommandResult, type CottageDelivery, FarmEvent, parseEvent } from '@kithfield/contracts';
import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CottageDO } from '../../src/cottage/cottage-object';
import { cottageOf } from '../../src/cottage/stub';
import { messageFrame, op, TestSocket } from './support/client';
import {
  api,
  cast,
  type Person,
  plantFarm,
  profile,
  type TestPorts,
  useTestPorts,
  pageOf,
  farmStub,
} from './support/doubles';

let ports: TestPorts;
beforeEach(() => {
  ports = useTestPorts();
});

/** Pip and Fig on a farm, both connected and caught up. */
const twoConnected = async () => {
  const { pip, fig } = await cast('pip', 'fig');
  const planted = await plantFarm(pip, [fig]);
  const pipSocket = await TestSocket.open(planted.farm);
  const figSocket = await TestSocket.open(planted.farm);
  await pipSocket.hello(pip, planted.farm, 3);
  await figSocket.hello(fig, planted.farm, 3);
  await pipSocket.drain();
  await figSocket.drain();
  return { ...planted, pip, fig, pipSocket, figSocket };
};

const httpCmd = (farm: string, person: Person, body: unknown) =>
  api(person, 'POST', `/v1/farms/${farm}/cmd`, body);

const until = async <T>(read: () => Promise<T>, ok: (value: T) => boolean): Promise<T> => {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (ok(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return read();
};

describe('a write', () => {
  it('is broadcast to every socket, the writer’s included, before the writer’s ack', async () => {
    const { pip, pipSocket, figSocket } = await twoConnected();
    pipSocket.send(messageFrame(1));
    const first = await pipSocket.next();
    const second = await pipSocket.next();
    expect([first.type, second.type]).toEqual(['event', 'ack']);
    const seen = parseEvent((await figSocket.next('event')).event);
    expect(seen).toMatchObject({
      status: 'known',
      event: { seq: 4, kind: 'message', actor: pip.id },
    });
    expect((await figSocket.drain()).some((f) => f.type === 'ack')).toBe(false);
  });

  it('applies once per op id: a repeat is acked with the first seq and broadcast to no one', async () => {
    const { farm, pip, pipSocket, figSocket, stub } = await twoConnected();
    pipSocket.send(messageFrame(1));
    expect(await pipSocket.next('ack')).toEqual({ type: 'ack', opId: op(1), seq: 4 });
    await figSocket.drain();
    pipSocket.send(messageFrame(1, 'sent twice'));
    expect(await pipSocket.next('ack')).toEqual({ type: 'ack', opId: op(1), seq: 4 });
    expect(await figSocket.drain()).toEqual([]);
    const again = await httpCmd(farm, pip, {
      opId: op(1),
      kind: 'message',
      payload: { text: 'again' },
    });
    expect(again).toEqual({ status: 200, body: { result: 'ack', opId: op(1), seq: 4 } });
    expect((await pageOf(stub, { limit: 50 })).events).toHaveLength(4);
  });

  it('is rejected with a reason, and a repeat keeps the first answer even when it would pass now', async () => {
    const { pipSocket, figSocket, stub } = await twoConnected();
    const { kit } = await cast('kit');
    const knock = { type: 'cmd', opId: op(7), kind: 'knock', payload: { to: kit.id } };
    pipSocket.send(knock);
    expect(await pipSocket.next('rejected')).toEqual({
      type: 'rejected',
      opId: op(7),
      reason: 'unavailable',
    });
    expect(await figSocket.drain()).toEqual([]);
    await stub.join(kit.id, profile(kit), true);
    pipSocket.send(knock);
    expect(await pipSocket.next('rejected')).toEqual({
      type: 'rejected',
      opId: op(7),
      reason: 'unavailable',
    });
  });

  it('knocks once per friend per farm day', async () => {
    const { pipSocket, fig } = await twoConnected();
    pipSocket.send({ type: 'cmd', opId: op(1), kind: 'knock', payload: { to: fig.id } });
    expect(await pipSocket.next('ack')).toMatchObject({ seq: 4 });
    pipSocket.send({ type: 'cmd', opId: op(2), kind: 'knock', payload: { to: fig.id } });
    expect(await pipSocket.next('rejected')).toMatchObject({ reason: 'limit_reached' });
    ports.clock.advance(24 * 60 * 60_000);
    pipSocket.send({ type: 'cmd', opId: op(3), kind: 'knock', payload: { to: fig.id } });
    expect(await pipSocket.next('ack')).toMatchObject({ opId: op(3) });
  });

  it.each([
    ['a known kind with a bad payload', { kind: 'message', payload: { text: '   ' } }],
    ['a kind this farm doesn’t know', { kind: 'teleport', payload: {} }],
    [
      'a kind only the farm writes',
      { kind: 'weather', payload: { day: '2054-10-18', weather: 'rain', source: 'x' } },
    ],
  ])('answers %s with `invalid`, and keeps that answer', async (_name, body) => {
    const { pip, pipSocket, farm } = await twoConnected();
    pipSocket.send({ type: 'cmd', opId: op(9), ...body });
    expect(await pipSocket.next('rejected')).toEqual({
      type: 'rejected',
      opId: op(9),
      reason: 'invalid',
    });
    const viaHttp = await httpCmd(farm, pip, {
      opId: op(9),
      kind: 'message',
      payload: { text: 'fine now' },
    });
    expect(viaHttp.body).toEqual({ result: 'rejected', opId: op(9), reason: 'invalid' });
  });

  it('checks targets, authorship and the edit window against the log', async () => {
    const { pipSocket, figSocket } = await twoConnected();
    pipSocket.send(messageFrame(1));
    await pipSocket.next('ack');
    figSocket.send({
      type: 'cmd',
      opId: op(2),
      kind: 'edit',
      payload: { target: 4, text: 'not yours' },
    });
    expect(await figSocket.next('rejected')).toMatchObject({ reason: 'not_allowed' });
    figSocket.send({
      type: 'cmd',
      opId: op(3),
      kind: 'reaction',
      payload: { target: 99, reaction: 'sun' },
    });
    expect(await figSocket.next('rejected')).toMatchObject({ reason: 'not_found' });
    figSocket.send({
      type: 'cmd',
      opId: op(5),
      kind: 'reaction',
      payload: { target: 2, reaction: 'sun' },
    });
    expect(await figSocket.next('rejected')).toMatchObject({ reason: 'not_found' });
    ports.clock.advance(16 * 60_000);
    pipSocket.send({
      type: 'cmd',
      opId: op(4),
      kind: 'edit',
      payload: { target: 4, text: 'too late' },
    });
    expect(await pipSocket.next('rejected')).toMatchObject({ reason: 'edit_window_closed' });
  });

  it('ignores frames it doesn’t know and text that isn’t JSON, and stays open', async () => {
    const { pipSocket } = await twoConnected();
    pipSocket.send({ type: 'wobble', at: 1 });
    pipSocket.send('not json');
    pipSocket.send(messageFrame(1));
    expect(await pipSocket.next('ack')).toMatchObject({ seq: 4 });
    expect(pipSocket.closed).toBeNull();
  });

  it('works over HTTP for members only, with a session or a device’s action key', async () => {
    const { pip, fig, kit } = await cast('pip', 'fig', 'kit');
    const { farm } = await plantFarm(pip, [fig]);
    const ok = await httpCmd(farm, fig, { opId: op(1), kind: 'dewdrop', payload: {} });
    expect(CommandResult.parse(ok.body)).toEqual({ result: 'ack', opId: op(1), seq: 4 });
    expect((await httpCmd(farm, kit, { opId: op(2), kind: 'dewdrop', payload: {} })).status).toBe(
      404,
    );
    expect((await httpCmd(farm, fig, { kind: 'dewdrop' })).status).toBe(400);
    expect(
      (
        await api(null, 'POST', `/v1/farms/${farm}/cmd`, {
          opId: op(3),
          kind: 'dewdrop',
          payload: {},
        })
      ).status,
    ).toBe(401);

    const device = { platform: 'ios', name: 'Fig’s phone', pushToken: null, appVersion: '1.0.0' };
    const registered = await api(fig, 'PUT', '/v1/devices/figphone1', device);
    const { actionKey } = registered.body as { actionKey: string };
    const reply = await exports.default.fetch(
      `https://dev.kithfield.com/api/v1/farms/${farm}/cmd`,
      {
        method: 'POST',
        headers: { 'Kithfield-Action-Key': actionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opId: op(4),
          kind: 'message',
          payload: { text: 'from the lock screen' },
        }),
      },
    );
    expect(await reply.json()).toEqual({ result: 'ack', opId: op(4), seq: 5 });
    const page = await farmStubPage(farm);
    expect(page.at(-1)).toMatchObject({ kind: 'message', actor: fig.id });
    const settingsByKey = await exports.default.fetch(
      `https://dev.kithfield.com/api/v1/farms/${farm}/cmd`,
      {
        method: 'POST',
        headers: { 'Kithfield-Action-Key': actionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ opId: op(6), kind: 'left', payload: {} }),
      },
    );
    expect(settingsByKey.status).toBe(403);
    const forged = await exports.default.fetch(
      `https://dev.kithfield.com/api/v1/farms/${farm}/cmd`,
      {
        method: 'POST',
        headers: { 'Kithfield-Action-Key': 'x'.repeat(43), 'Content-Type': 'application/json' },
        body: JSON.stringify({ opId: op(5), kind: 'dewdrop', payload: {} }),
      },
    );
    expect(forged.status).toBe(401);
  });
});

const farmStubPage = async (farm: string) =>
  (await pageOf(farmStub(farm), { limit: 50 })).events.map((e) => FarmEvent.parse(e));

describe('presence and typing', () => {
  it('shares who is here and writing, never stores it, and writes farm_opened at most hourly', async () => {
    const { pip, fig, pipSocket, figSocket, stub } = await twoConnected();
    pipSocket.send({ type: 'presence', here: true });
    expect(await figSocket.next('presence')).toEqual({
      type: 'presence',
      here: [pip.id],
      fire: [],
    });
    expect(parseEvent((await figSocket.next('event')).event)).toMatchObject({
      event: { kind: 'farm_opened', actor: pip.id },
    });
    figSocket.send({ type: 'typing', on: true });
    expect(await pipSocket.next('typing')).toEqual({ type: 'typing', people: [fig.id] });

    for (const advance of [0, 61 * 60_000]) {
      ports.clock.advance(advance);
      pipSocket.send({ type: 'presence', here: false });
      pipSocket.send({ type: 'presence', here: true });
      await pipSocket.drain();
    }
    const opened = (await pageOf(stub, { limit: 50, kinds: ['farm_opened'] })).events;
    expect(opened.map((e) => e.at)).toEqual([ports.clock.at - 61 * 60_000, ports.clock.at]);

    figSocket.close();
    expect(await pipSocket.next('typing')).toEqual({ type: 'typing', people: [] });
  });

  it('writes shared rain once a day when three members open the farm within ten minutes', async () => {
    const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
    const { farm, stub } = await plantFarm(pip, [fig, bea]);
    for (const person of [pip, fig, bea]) {
      const socket = await TestSocket.open(farm);
      await socket.hello(person, farm, 4);
      socket.send({ type: 'presence', here: true });
      await socket.drain();
      ports.clock.advance(60_000);
    }
    const rain = (await pageOf(stub, { limit: 50, kinds: ['shared_rain'] })).events;
    const people = [pip.id, fig.id, bea.id];
    expect(rain.map((e) => [e.actor, (e.payload as { people: string[] }).people.sort()])).toEqual([
      [null, people.sort()],
    ]);
  });
});

describe('the cottages', () => {
  it('hear each event: the chat list shows the farm, and deliveries say who has it open and whom it is for', async () => {
    const { farm, pip, fig, pipSocket, figSocket } = await twoConnected();
    const figCottage = cottageOf(env, fig.id);
    const delivered: CottageDelivery[] = [];
    const original = Object.getOwnPropertyDescriptor(CottageDO.prototype, 'deliver')?.value as (
      this: CottageDO,
      d: CottageDelivery,
    ) => Promise<void>;
    const spy = vi.spyOn(CottageDO.prototype, 'deliver').mockImplementation(async function (
      this: CottageDO,
      d,
    ) {
      if (d.farm === farm && d.kind === 'message') delivered.push(d);
      await original.call(this, d);
    });
    pipSocket.send({
      type: 'cmd',
      opId: op(1),
      kind: 'message',
      payload: { text: 'hi Fig', mentions: [fig.id] },
    });
    await pipSocket.next('ack');
    const list = await until(
      () => figCottage.chatList(),
      (l) => l.some((row) => row.seq === 4),
    );
    expect(list).toEqual([
      expect.objectContaining({
        farm,
        farmKind: 'farm',
        name: 'The Thursday Lot',
        seq: 4,
        kind: 'message',
        preview: 'hi Fig',
        forYou: true,
      }),
    ]);
    // One delivery for each member's cottage: Pip wrote it, Fig is mentioned; both have it open.
    const fourth = delivered.filter((d) => d.seq === 4).map((d) => [d.forYou, d.connected]);
    expect(fourth.sort()).toEqual([
      [false, true],
      [true, true],
    ]);
    figSocket.close();
    await pipSocket.drain();
    pipSocket.send(messageFrame(2));
    await until(
      () => Promise.resolve(delivered.filter((d) => d.seq === 5).length),
      (n) => n >= 2,
    );
    const fifth = delivered
      .filter((d) => d.seq === 5)
      .map((d) => d.connected)
      .sort();
    expect(fifth).toEqual([false, true]);
    expect((await cottageOf(env, pip.id).chatList())[0]).toMatchObject({ farm, seq: 5 });
    spy.mockRestore();
  });
});

describe('leaving', () => {
  it('closes the leaver’s sockets, ends their membership and drops the farm from their chat list', async () => {
    const { farm, fig, figSocket } = await twoConnected();
    figSocket.send({ type: 'cmd', opId: op(1), kind: 'left', payload: {} });
    expect(await figSocket.next('event')).toMatchObject({
      event: { kind: 'left', payload: { how: 'left' } },
    });
    expect(await figSocket.next('error')).toEqual({ type: 'error', code: 'not_member' });
    await figSocket.waitClosed();
    const row = await until(
      () =>
        env.DB.prepare('SELECT left_at FROM memberships WHERE farm_id = ? AND person_id = ?')
          .bind(farm, fig.id)
          .first<{ left_at: number | null }>(),
      (r) => r?.left_at !== null,
    );
    expect(row?.left_at).toBe(ports.clock.at);
    expect(
      await until(
        () => cottageOf(env, fig.id).chatList(),
        (l) => l.length === 0,
      ),
    ).toEqual([]);
  });

  it('hands the farm to the longest-standing member when the last keeper leaves', async () => {
    const { pip, fig, bea } = await cast('pip', 'fig', 'bea');
    const { farm, stub } = await plantFarm(pip, [fig]);
    ports.clock.advance(60_000);
    await stub.join(bea.id, profile(bea), true);
    expect(await stub.command(pip.id, { opId: op(1), kind: 'left', payload: {} })).toMatchObject({
      result: 'ack',
      seq: 5,
    });
    const last = (await farmStubPage(farm)).at(-1);
    expect(last).toMatchObject({
      seq: 6,
      kind: 'settings_changed',
      actor: null,
      payload: { setting: 'role', person: fig.id, role: 'keeper' },
    });
    expect((await stub.state())?.members.find((m) => m.person === fig.id)?.role).toBe('keeper');
    const d1 = await env.DB.prepare('SELECT keeper_id FROM farms WHERE id = ?').bind(farm).first();
    expect(d1).toEqual({ keeper_id: fig.id });
  });
});

describe('hibernating', () => {
  it('writes hibernate on every farm the person lives on, and right after joining one', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip);
    expect((await api(pip, 'PUT', '/v1/me/hibernate', { on: true })).status).toBe(204);
    expect((await farmStubPage(farm)).at(-1)).toMatchObject({
      kind: 'hibernate',
      actor: pip.id,
      payload: { on: true },
    });
    expect((await api(fig, 'PUT', '/v1/me/hibernate', { on: true })).status).toBe(204);
    await stub.join(fig.id, profile(fig), true);
    const tail = (await farmStubPage(farm)).slice(-2).map((e) => [e.kind, e.actor]);
    expect(tail).toEqual([
      ['joined', fig.id],
      ['hibernate', fig.id],
    ]);
  });
});
