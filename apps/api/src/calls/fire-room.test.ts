import { FarmEvent, fireRoomOf, FireTokenResponse, LIMITS } from '@kithfield/contracts';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { op } from '../../test/farm/support/client';
import {
  api,
  cast,
  pageOf,
  type Person,
  plantFarm,
  settled,
  type TestPorts,
  useTestPorts,
} from '../../test/farm/support/doubles';
import { fromBase64Url } from './jwt';
import {
  askedFor,
  deliverHook,
  participantEvent,
  standInLiveKit,
} from './livekit-double.test-data';

let ports: TestPorts;
let pip: Person;
let bea: Person;
let room: ReturnType<typeof standInLiveKit>;

beforeEach(async () => {
  ports = useTestPorts();
  ({ pip, bea } = await cast('pip', 'bea'));
  room = standInLiveKit();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const light = (stub: Awaited<ReturnType<typeof plantFarm>>['stub'], who: Person, n = 1) =>
  stub.command(who.id, { opId: op(n), kind: 'fire', payload: { state: 'lit' } });

const lastFire = async (stub: Awaited<ReturnType<typeof plantFarm>>['stub']) =>
  (await pageOf(stub, { after: 0 })).events
    .map((e) => FarmEvent.parse(e))
    .filter((e) => e.kind === 'fire')
    .at(-1)?.payload;

describe('people who may no longer sit by the fire', () => {
  it('takes someone removed from the farm out of the room', async () => {
    const { farm, stub } = await plantFarm(pip, [bea]);
    await light(stub, pip);
    room.inRoom = [{ identity: bea.id, attributes: { mode: 'join' } }];
    await deliverHook(participantEvent('participant_joined', fireRoomOf(farm), bea.id, 100));
    await stub.command(pip.id, {
      opId: op(2),
      kind: 'removed',
      payload: { person: bea.id, removeMedia: false },
    });
    expect(await askedFor(room, 'RemoveParticipant')).toContainEqual({
      room: fireRoomOf(farm),
      identity: bea.id,
    });
  });

  it('takes someone banned out of the room', async () => {
    const { farm, stub } = await plantFarm(pip, [bea]);
    await light(stub, pip);
    room.inRoom = [{ identity: bea.id, attributes: { mode: 'join' } }];
    await stub.closeSockets(bea.id, 'banned');
    expect(await askedFor(room, 'RemoveParticipant')).toContainEqual({
      room: fireRoomOf(farm),
      identity: bea.id,
    });
  });

  it('mints tokens that last minutes, not an evening', async () => {
    const { farm, stub } = await plantFarm(pip);
    await light(stub, pip);
    const issued = await api(pip, 'POST', `/v1/farms/${farm}/fire-token`, { mode: 'listen' });
    const token = FireTokenResponse.parse(issued.body).token;
    const claims = JSON.parse(
      new TextDecoder().decode(fromBase64Url(token.split('.')[1] ?? '') ?? undefined),
    ) as { nbf: number; exp: number };
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(10 * 60);
  });
});

describe('the fire going out', () => {
  it('stays lit while the room says someone is there, though the webhook missed them', async () => {
    const { farm, stub } = await plantFarm(pip);
    await light(stub, pip);
    await deliverHook(participantEvent('participant_joined', fireRoomOf(farm), pip.id, 100));
    ports.clock.advance(10 * 60_000);
    room.inRoom = [{ identity: pip.id, sid: 'PA_x', joinedAt: '100', attributes: {} }];
    const due = await runInDurableObject(stub, (_f, state) => state.storage.getAlarm());
    if (due !== null) ports.clock.at = due;
    await runDurableObjectAlarm(stub);
    await settled(stub);
    expect(await lastFire(stub)).toEqual({ state: 'lit' });
    // It looks again later rather than forgetting.
    expect(await runInDurableObject(stub, (_f, state) => state.storage.getAlarm())).not.toBeNull();
  });

  it('goes out when the room is empty though the webhook never said they left', async () => {
    const { farm, stub } = await plantFarm(pip);
    await light(stub, pip);
    await deliverHook(participantEvent('participant_joined', fireRoomOf(farm), pip.id, 100));
    room.inRoom = [];
    for (let i = 0; i < 5; i++) {
      const due = await runInDurableObject(stub, (_f, state) => state.storage.getAlarm());
      if (due === null) break;
      ports.clock.at = due;
      await runDurableObjectAlarm(stub);
      if (JSON.stringify(await lastFire(stub)) === '{"state":"out"}') break;
    }
    expect(await lastFire(stub)).toEqual({ state: 'out' });
  });

  it('won’t seat anyone by a fire that is out', async () => {
    const { farm } = await plantFarm(pip);
    const issued = await api(pip, 'POST', `/v1/farms/${farm}/fire-token`, { mode: 'join' });
    expect(issued.status).toBe(409);
  });
});

describe('LiveKit’s webhook, again', () => {
  it('acts on each event once, however often it is delivered', async () => {
    const { farm, stub } = await plantFarm(pip);
    await light(stub, pip);
    const joined = participantEvent('participant_joined', fireRoomOf(farm), pip.id, 100, '');
    await deliverHook(joined);
    await deliverHook({
      event: 'room_finished',
      id: 'EV_fin',
      createdAt: '101',
      room: { name: fireRoomOf(farm), sid: '' },
    });
    await deliverHook(joined);
    const circle = await runInDurableObject(stub, (_f, state) =>
      state.storage.kv.get('fire-circle'),
    );
    expect(Object.keys((circle as { people: object }).people)).toEqual([]);
  });

  it('refuses a signature with no expiry', async () => {
    const { farm } = await plantFarm(pip);
    const res = await deliverHook(
      participantEvent('participant_joined', fireRoomOf(farm), pip.id, 1),
      {
        exp: false,
      },
    );
    expect(res.status).toBe(401);
  });
});

describe('the captions route', () => {
  const send = (who: Person, farm: string, init: RequestInit = {}) =>
    exports.default.fetch(
      `https://dev.kithfield.com/api/v1/farms/${farm}/fire/captions?chunk=0&startedAt=1000`,
      {
        method: 'POST',
        ...init,
        headers: {
          authorization: `Bearer ${who.token}`,
          'content-type': 'audio/wav',
          ...(init.headers as Record<string, string> | undefined),
        },
      },
    );
  const wav = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);

  it('refuses a piece that doesn’t say how long it is', async () => {
    const { farm, stub } = await plantFarm(pip);
    await light(stub, pip);
    await api(pip, 'PUT', '/v1/me/consents/captions', { allowed: true, textVersion: 'v1' });
    room.inRoom = [{ identity: pip.id, attributes: { mode: 'join' } }];
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(wav);
        c.close();
      },
    });
    const res = await send(pip, farm, { body: stream });
    expect(res.status).toBe(400);
  });

  it('takes voices only from someone joined in the room, not a listener or a stranger to it', async () => {
    const { farm, stub } = await plantFarm(pip);
    await light(stub, pip);
    await api(pip, 'PUT', '/v1/me/consents/captions', { allowed: true, textVersion: 'v1' });
    room.inRoom = [];
    expect((await send(pip, farm, { body: wav })).status).toBe(403);
    room.inRoom = [{ identity: pip.id, attributes: { mode: 'listen' } }];
    expect((await send(pip, farm, { body: wav })).status).toBe(403);
    room.inRoom = [{ identity: pip.id, attributes: { mode: 'join' } }];
    expect((await send(pip, farm, { body: wav })).status).toBe(200);
  });

  it('takes about twelve pieces a minute from one person', async () => {
    const { farm, stub } = await plantFarm(pip);
    await light(stub, pip);
    await api(pip, 'PUT', '/v1/me/consents/captions', { allowed: true, textVersion: 'v1' });
    room.inRoom = [{ identity: pip.id, attributes: { mode: 'join' } }];
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) statuses.push((await send(pip, farm, { body: wav })).status);
    expect(statuses.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    expect(LIMITS.captionChunkMs).toBeGreaterThan(0);
  });
});

describe('presence as the fire is lit and goes out', () => {
  it('tells phones again when the fire goes out, so nobody is drawn by a cold fire', async () => {
    const { TestSocket } = await import('../../test/farm/support/client');
    const { farm, stub } = await plantFarm(pip, [bea]);
    await light(stub, pip);
    await deliverHook(participantEvent('participant_joined', fireRoomOf(farm), pip.id, 100));
    const socket = await TestSocket.open(farm);
    await socket.hello(bea, farm);
    expect(await socket.next('presence')).toMatchObject({ fire: [pip.id] });
    room.inRoom = [];
    // The socket's hello deadline comes first; the fire's own timer after it.
    for (let i = 0; i < 4 && JSON.stringify(await lastFire(stub)) !== '{"state":"out"}'; i++) {
      const due = await runInDurableObject(stub, (_f, state) => state.storage.getAlarm());
      if (due === null) break;
      ports.clock.at = due;
      await runDurableObjectAlarm(stub);
    }
    expect(await socket.next('presence')).toMatchObject({ fire: [] });
    socket.close();
  });
});
