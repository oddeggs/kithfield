import { CommandResult, parseEvent } from '@kithfield/contracts';
import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { messageFrame, op, TestSocket } from './support/client';
import { as, plantFarm, PROFILES, type TestPorts, useTestPorts } from './support/doubles';

let ports: TestPorts;
beforeEach(() => {
  ports = useTestPorts();
});

/** Plants a farm with Pip and Fig, both connected and caught up. */
const twoConnected = async () => {
  const planted = await plantFarm(['fig']);
  const pip = await TestSocket.open(planted.farm);
  const fig = await TestSocket.open(planted.farm);
  await pip.hello('pip', planted.farm, 3);
  await fig.hello('fig', planted.farm, 3);
  await pip.drain();
  await fig.drain();
  return { ...planted, pip, fig };
};

const httpCmd = async (farm: string, person: string, body: unknown) => {
  const response = await exports.default.fetch(
    `https://dev.kithfield.com/api/v1/farms/${farm}/cmd`,
    {
      method: 'POST',
      headers: { ...as(person), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, body: await response.json() };
};

describe('a write', () => {
  it('is broadcast to every socket, the writer’s included, before the writer’s ack', async () => {
    const { pip, fig } = await twoConnected();
    pip.send(messageFrame(1));
    expect((await pip.drain()).map((f) => f.type)).toEqual(['event', 'ack']);
    const seen = await fig.next('event');
    expect(parseEvent(seen.event)).toMatchObject({
      status: 'known',
      event: { seq: 4, kind: 'message', actor: 'pip' },
    });
    expect((await fig.drain()).some((f) => f.type === 'ack')).toBe(false);
  });

  it('applies once per op id: a repeat is acked with the first seq and broadcast to no one', async () => {
    const { farm, pip, fig, stub } = await twoConnected();
    pip.send(messageFrame(1));
    expect(await pip.next('ack')).toEqual({ type: 'ack', opId: op(1), seq: 4 });
    await fig.drain();
    pip.send(messageFrame(1, 'sent twice'));
    expect(await pip.next('ack')).toEqual({ type: 'ack', opId: op(1), seq: 4 });
    expect(await fig.drain()).toEqual([]);
    expect(
      await httpCmd(farm, 'pip', { opId: op(1), kind: 'message', payload: { text: 'again' } }),
    ).toEqual({
      status: 200,
      body: { result: 'ack', opId: op(1), seq: 4 },
    });
    expect((await stub.page({ limit: 50 })).events).toHaveLength(4);
  });

  it('is rejected with a reason, and a repeat keeps the first answer even when it would pass now', async () => {
    const { pip, fig, stub } = await twoConnected();
    const knock = { type: 'cmd', opId: op(7), kind: 'knock', payload: { to: 'kit' } };
    pip.send(knock);
    expect(await pip.next('rejected')).toEqual({
      type: 'rejected',
      opId: op(7),
      reason: 'unavailable',
    });
    expect(await fig.drain()).toEqual([]);
    await stub.join('kit', PROFILES['kit']!, true);
    pip.send(knock);
    expect(await pip.next('rejected')).toEqual({
      type: 'rejected',
      opId: op(7),
      reason: 'unavailable',
    });
  });

  it.each([
    ['a known kind with a bad payload', { kind: 'message', payload: { text: '   ' } }],
    ['a kind this farm doesn’t know', { kind: 'teleport', payload: {} }],
    [
      'a kind only the farm writes',
      { kind: 'weather', payload: { day: '2054-10-18', weather: 'rain', source: 'x' } },
    ],
  ])('answers %s with `invalid`, and keeps that answer', async (_name, body) => {
    const { pip, farm } = await twoConnected();
    pip.send({ type: 'cmd', opId: op(9), ...body });
    expect(await pip.next('rejected')).toEqual({
      type: 'rejected',
      opId: op(9),
      reason: 'invalid',
    });
    const viaHttp = await httpCmd(farm, 'pip', {
      opId: op(9),
      kind: 'message',
      payload: { text: 'fine now' },
    });
    expect(viaHttp.body).toEqual({ result: 'rejected', opId: op(9), reason: 'invalid' });
  });

  it('checks targets against the log', async () => {
    const { pip, fig } = await twoConnected();
    pip.send(messageFrame(1));
    await pip.next('ack');
    fig.send({ type: 'cmd', opId: op(2), kind: 'edit', payload: { target: 4, text: 'not yours' } });
    expect(await fig.next('rejected')).toMatchObject({ reason: 'not_allowed' });
    fig.send({
      type: 'cmd',
      opId: op(3),
      kind: 'reaction',
      payload: { target: 99, reaction: 'sun' },
    });
    expect(await fig.next('rejected')).toMatchObject({ reason: 'not_found' });
    ports.clock.advance(16 * 60_000);
    pip.send({ type: 'cmd', opId: op(4), kind: 'edit', payload: { target: 4, text: 'too late' } });
    expect(await pip.next('rejected')).toMatchObject({ reason: 'edit_window_closed' });
  });

  it('ignores frames it doesn’t know and text that isn’t JSON, and stays open', async () => {
    const { pip } = await twoConnected();
    pip.send({ type: 'wobble', at: 1 });
    pip.send('not json');
    pip.send(messageFrame(1));
    expect(await pip.next('ack')).toMatchObject({ seq: 4 });
    expect(pip.closed).toBeNull();
  });

  it('works over HTTP for members only, answering a contract CommandResult', async () => {
    const { farm } = await plantFarm(['fig']);
    const ok = await httpCmd(farm, 'fig', { opId: op(1), kind: 'dewdrop', payload: {} });
    expect(CommandResult.parse(ok.body)).toEqual({ result: 'ack', opId: op(1), seq: 4 });
    expect((await httpCmd(farm, 'kit', { opId: op(2), kind: 'dewdrop', payload: {} })).status).toBe(
      404,
    );
    expect((await httpCmd(farm, 'fig', { kind: 'dewdrop' })).status).toBe(400);
  });
});

describe('presence and typing', () => {
  it('shares who is here and writing, never stores it, and writes farm_opened at most hourly', async () => {
    const { pip, fig, stub } = await twoConnected();
    pip.send({ type: 'presence', here: true });
    expect(await fig.next('presence')).toEqual({ type: 'presence', here: ['pip'] });
    expect(parseEvent((await fig.next('event')).event)).toMatchObject({
      event: { kind: 'farm_opened', actor: 'pip' },
    });
    fig.send({ type: 'typing', on: true });
    expect(await pip.next('typing')).toEqual({ type: 'typing', people: ['fig'] });

    pip.send({ type: 'presence', here: false });
    pip.send({ type: 'presence', here: true });
    await pip.drain();
    ports.clock.advance(61 * 60_000);
    pip.send({ type: 'presence', here: false });
    pip.send({ type: 'presence', here: true });
    await pip.drain();
    const opened = (await stub.page({ limit: 50, kinds: ['farm_opened'] })).events;
    expect(opened.map((e) => e.at)).toEqual([ports.clock.at - 61 * 60_000, ports.clock.at]);

    fig.close();
    expect(await pip.next('typing')).toEqual({ type: 'typing', people: [] });
  });

  it('writes shared rain once a day when three members are here within ten minutes', async () => {
    const { farm, stub } = await plantFarm(['fig', 'bea']);
    for (const person of ['pip', 'fig', 'bea']) {
      const socket = await TestSocket.open(farm);
      await socket.hello(person, farm, 4);
      socket.send({ type: 'presence', here: true });
      await socket.drain();
      ports.clock.advance(60_000);
    }
    const rain = (await stub.page({ limit: 50, kinds: ['shared_rain'] })).events;
    expect(rain.map((e) => [e.actor, e.payload])).toEqual([
      [null, { day: '2054-10-18', people: ['bea', 'fig', 'pip'] }],
    ]);
  });
});

describe('the cottage handoff', () => {
  it('tells each member’s cottage, with whether they have the farm open and whether it is for them', async () => {
    const { pip } = await twoConnected();
    ports.cottage.deliveries.length = 0;
    pip.send({
      type: 'cmd',
      opId: op(1),
      kind: 'message',
      payload: { text: 'hi @Fig', mentions: ['fig'] },
    });
    await pip.next('ack');
    await pip.drain();
    const forFig = ports.cottage.for('fig').filter((d) => d.kind === 'message');
    expect(forFig).toEqual([
      expect.objectContaining({
        seq: 4,
        kind: 'message',
        actor: 'pip',
        preview: 'hi @Fig',
        forYou: true,
        connected: true,
      }),
    ]);
    expect(ports.cottage.for('pip').filter((d) => d.kind === 'message')[0]).toMatchObject({
      forYou: false,
    });
  });
});

describe('leaving', () => {
  it('closes the leaver’s sockets and ends their membership', async () => {
    const { farm, fig } = await twoConnected();
    fig.send({ type: 'cmd', opId: op(1), kind: 'left', payload: {} });
    expect(await fig.next('event')).toMatchObject({
      event: { kind: 'left', payload: { how: 'left' } },
    });
    expect(await fig.next('error')).toEqual({ type: 'error', code: 'not_member' });
    await fig.waitClosed();
    const row = await env.DB.prepare(
      'SELECT left_at FROM memberships WHERE farm_id = ? AND person_id = ?',
    )
      .bind(farm, 'fig')
      .first<{ left_at: number | null }>();
    expect(row?.left_at).toBe(ports.clock.at);
  });
});
