import { type CottageDelivery, FarmEvent } from '@kithfield/contracts';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { standInLiveKit } from '../../src/calls/livekit-double.test-data';
import { CottageDO } from '../../src/cottage/cottage-object';
import { configureFarmPorts } from '../../src/farm/wiring';
import { messageFrame, op, TestSocket } from './support/client';
import {
  api,
  cast,
  hostOf,
  pageOf,
  plantFarm,
  profile,
  settled,
  type TestPorts,
  useTestPorts,
} from './support/doubles';

let ports: TestPorts;
beforeEach(() => {
  ports = useTestPorts();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const membership = (farm: string, person: string) =>
  env.DB.prepare('SELECT left_at FROM memberships WHERE farm_id = ? AND person_id = ?')
    .bind(farm, person)
    .first<{ left_at: number | null }>();

/** D1 refuses farm membership writes until `heal` is called. */
const breakMemberships = async () => {
  await env.DB.prepare('ALTER TABLE memberships RENAME TO memberships_away').run();
  return () => env.DB.prepare('ALTER TABLE memberships_away RENAME TO memberships').run();
};

describe('who lives on the farm', () => {
  it('is the farm’s own say: someone removed is refused even while D1 still lists them', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    await stub.removeMember(fig.id, false);
    // D1 is a mirror that may lag: put fig back in it, as if the removal hadn't reached it yet.
    await env.DB.prepare(
      'UPDATE memberships SET left_at = NULL WHERE farm_id = ? AND person_id = ?',
    )
      .bind(farm, fig.id)
      .run();
    const socket = await TestSocket.open(farm);
    expect((await socket.hello(fig, farm)).error).toBe('not_member');
    expect((await api(fig, 'GET', `/v1/farms/${farm}/events`)).status).toBe(404);
    expect((await api(fig, 'GET', `/v1/farms/${farm}/search?q=hello`)).status).toBe(404);
    expect(await stub.page(fig.id, { limit: 10 })).toBeNull();
  });

  it('still revokes access and deletes media when D1 fails, and the mirror catches up later', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const key = `farm/${farm}/eeee0000-0000-4000-8000-000000000000`;
    await env.MEDIA.put(key, 'pixels');
    await stub.command(fig.id, {
      opId: op(1),
      kind: 'media',
      payload: { items: [{ key, mime: 'image/jpeg', bytes: 6 }] },
    });
    const socket = await TestSocket.open(farm);
    await socket.hello(fig, farm, 4);
    const heal = await breakMemberships();
    expect(await stub.removeMember(fig.id, true)).toMatchObject({ ok: true });
    expect(await socket.next('error')).toEqual({ type: 'error', code: 'not_member' });
    expect(await env.MEDIA.head(key)).toBeNull();
    expect(await stub.page(fig.id, { limit: 10 })).toBeNull();
    const timers = await hostOf(stub, (h) =>
      h.store.dueTimers(Number.MAX_SAFE_INTEGER).map((t) => t.key),
    );
    expect(timers).toContain('d1sync:5');

    await heal();
    expect(await membership(farm, fig.id)).toEqual({ left_at: null });
    ports.clock.advance(2 * 60_000);
    await runDurableObjectAlarm(stub);
    expect((await membership(farm, fig.id))?.left_at).not.toBeNull();
  });
});

describe('the membership mirror', () => {
  it('is caught up from the farm as it is now, so a late retry never brings back someone who left', async () => {
    const { pip, kit } = await cast('pip', 'kit');
    const { farm, stub } = await plantFarm(pip, [kit]);
    await stub.command(kit.id, { opId: op(1), kind: 'left', payload: {} });
    // Kit comes back while D1 is down, so the mirror of that `joined` waits for a retry...
    const heal = await breakMemberships();
    await stub.join(kit.id, profile(kit), true);
    await heal();
    // ...and leaves again before the retry runs.
    await stub.command(kit.id, { opId: op(2), kind: 'left', payload: {} });
    ports.clock.advance(2 * 60_000);
    await runDurableObjectAlarm(stub);
    expect((await membership(farm, kit.id))?.left_at).not.toBeNull();
    expect((await stub.state())?.members.map((m) => m.person)).toEqual([pip.id]);
  });
});

describe('the cottages', () => {
  it('hear after the writer has its answer, and what they missed is sent again by the alarm', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { stub } = await plantFarm(pip, [fig]);
    await settled(stub);
    const original = Object.getOwnPropertyDescriptor(CottageDO.prototype, 'deliver')?.value as (
      this: CottageDO,
      d: CottageDelivery,
    ) => Promise<void>;
    const failing = vi.spyOn(CottageDO.prototype, 'deliver').mockRejectedValue(new Error('down'));
    await stub.command(pip.id, { opId: op(1), kind: 'message', payload: { text: 'hello' } });
    await settled(stub);
    expect(await hostOf(stub, (h) => h.store.owedDeliveries())).toEqual([4]);
    failing.mockImplementation(async function (this: CottageDO, d) {
      await original.call(this, d);
    });
    ports.clock.advance(2 * 60_000);
    await runDurableObjectAlarm(stub);
    expect(await hostOf(stub, (h) => h.store.owedDeliveries())).toEqual([]);
  });

  it('are tried again later and later when a cottage keeps failing, and given up after a day', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { stub } = await plantFarm(pip, [fig]);
    await settled(stub);
    vi.spyOn(CottageDO.prototype, 'deliver').mockRejectedValue(new Error('down'));
    const log = vi.spyOn(console, 'error');
    await stub.command(pip.id, { opId: op(1), kind: 'message', payload: { text: 'hello' } });
    await settled(stub);
    const sent = ports.clock.at;
    const retries = () => hostOf(stub, (h) => h.store.deliveryRetries());
    expect(await retries()).toEqual([{ seq: 4, attempts: 1, nextAt: sent + 60_000 }]);
    const gaps: number[] = [];
    for (const step of [60_000, 5 * 60_000, 30 * 60_000]) {
      ports.clock.advance(step);
      await runDurableObjectAlarm(stub);
      const [retry] = await retries();
      gaps.push((retry?.nextAt ?? 0) - ports.clock.at);
    }
    expect(gaps).toEqual([5 * 60_000, 30 * 60_000, 60 * 60_000]);
    ports.clock.at = sent + 24 * 60 * 60_000;
    await runDurableObjectAlarm(stub);
    expect(await retries()).toEqual([]);
    expect(log.mock.calls.some(([line]) => String(line).includes('gave up'))).toBe(true);
  });

  it('hear every event meant for them in a burst, and of the rest only the newest', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { stub } = await plantFarm(pip, [fig]);
    await settled(stub);
    const heard: CottageDelivery[] = [];
    const spy = vi.spyOn(CottageDO.prototype, 'deliver').mockRejectedValue(new Error('down'));
    await stub.command(pip.id, { opId: op(1), kind: 'message', payload: { text: 'one' } });
    await stub.command(pip.id, { opId: op(2), kind: 'knock', payload: { to: fig.id } });
    await stub.command(pip.id, { opId: op(3), kind: 'message', payload: { text: 'two' } });
    await stub.command(pip.id, { opId: op(4), kind: 'message', payload: { text: 'three' } });
    await settled(stub);
    spy.mockImplementation((d) => {
      heard.push(d);
      return Promise.resolve();
    });
    await settled(stub);
    await hostOf(stub, (h) => h.flush());
    ports.clock.advance(2 * 60_000);
    await runDurableObjectAlarm(stub);
    const forFig = heard.filter((d) => d.forYou || d.seq === 7).map((d) => d.seq);
    expect(heard.filter((d) => d.seq === 4 || d.seq === 6)).toEqual([]);
    expect(forFig).toContain(5);
    expect(forFig).toContain(7);
  });
});

describe('the alarm', () => {
  it('runs each timer on its own: weather that fails is asked again about a minute later', async () => {
    // The fire's timer asks the room who is there: nobody.
    standInLiveKit();
    const { pip } = await cast('pip');
    const { stub } = await plantFarm(pip);
    const place = {
      setting: 'place',
      place: { city: 'London', country: 'GB', lat: 51.5, lng: -0.12 },
    } as const;
    await stub.command(pip.id, { opId: op(1), kind: 'settings_changed', payload: place });
    await stub.command(pip.id, { opId: op(2), kind: 'fire', payload: { state: 'lit' } });
    vi.spyOn(ports.weather, 'today').mockRejectedValueOnce(new Error('weather down'));
    ports.clock.at = Date.UTC(2054, 9, 19, 4, 0);
    await runDurableObjectAlarm(stub);
    const log = (await pageOf(stub, { after: 2 })).events.map((e) => FarmEvent.parse(e).kind);
    expect(log).toContain('fire');
    const timers = await hostOf(stub, (h) => h.store.dueTimers(Number.MAX_SAFE_INTEGER));
    const retry = timers.find((t) => t.key === 'weather:2054-10-19:1')?.due ?? 0;
    // A minute, moved by up to a fifth either way.
    expect(retry - ports.clock.at).toBeGreaterThanOrEqual(48_000);
    expect(retry - ports.clock.at).toBeLessThanOrEqual(72_000);
  });
});

describe('a write that fails for a reason of its own', () => {
  it('is not answered for good: the phone tries again and the write applies', async () => {
    const { pip } = await cast('pip');
    const { stub } = await plantFarm(pip);
    const real = ports.rules;
    ports.rules = {
      ...real,
      checkCommand: () => {
        throw new Error('fault');
      },
    };
    configureFarmPorts(ports);
    // An RPC promise is awaited once, in a try: handing it to `expect().rejects` reads it twice.
    let thrown = false;
    try {
      await stub.command(pip.id, { opId: op(1), kind: 'dewdrop', payload: {} });
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);
    expect(await stub.answered(op(1))).toBeNull();
    ports.rules = real;
    configureFarmPorts(ports);
    expect(await stub.command(pip.id, { opId: op(1), kind: 'dewdrop', payload: {} })).toMatchObject(
      { result: 'ack' },
    );
  });
});

describe('sockets', () => {
  it('close if they never say hello, and on request for one person', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const silent = await TestSocket.open(farm);
    const figSocket = await TestSocket.open(farm);
    await figSocket.hello(fig, farm, 3);
    const pipSocket = await TestSocket.open(farm);
    await pipSocket.hello(pip, farm, 3);
    ports.clock.advance(31_000);
    await runInDurableObject(stub, async (_f, state) => {
      await state.storage.setAlarm(Date.now() + 60_000);
    });
    await runDurableObjectAlarm(stub);
    expect((await silent.waitClosed()).reason).toBe('unauthorized');
    expect(figSocket.closed).toBeNull();
    await stub.closeSockets(fig.id, 'banned');
    expect((await figSocket.waitClosed()).reason).toBe('banned');
    pipSocket.send(messageFrame(1));
    expect(await pipSocket.next('ack')).toMatchObject({ seq: 4 });
  });
});
