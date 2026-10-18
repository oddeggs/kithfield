import { FarmEvent } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { op, TestSocket } from './support/client';
import { cast, plantFarm, profile, useTestPorts, pageOf, searchOf } from './support/doubles';

beforeEach(() => {
  useTestPorts();
});

const photo = async (farm: string, name: string) => {
  const key = `farm/${farm}/${name.padEnd(8, '0')}-0000-4000-8000-000000000000`;
  await env.MEDIA.put(key, 'pixels');
  return {
    kind: 'media' as const,
    payload: { items: [{ key, mime: 'image/jpeg', bytes: 6 }], caption: 'the allotment' },
    key,
  };
};

type Stub = Awaited<ReturnType<typeof plantFarm>>['stub'];

const eventAt = async (stub: Stub, seq: number) =>
  FarmEvent.parse((await pageOf(stub, { after: seq - 1, limit: 1 })).events[0]);

const tail = async (stub: Stub, count: number) =>
  (await pageOf(stub, { limit: count })).events.map((e) => FarmEvent.parse(e));

describe('unsend', () => {
  it('turns the target into a tombstone that keeps its facts, with its edits and media', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    await stub.command(pip.id, { opId: op(1), kind: 'dewdrop', payload: { to: fig.id } });
    await stub.command(pip.id, { opId: op(2), kind: 'message', payload: { text: 'secret plans' } });
    await stub.command(pip.id, {
      opId: op(3),
      kind: 'edit',
      payload: { target: 5, text: 'secret plans!' },
    });
    const pic = await photo(farm, 'aaaa');
    await stub.command(pip.id, { opId: op(4), ...pic, kind: 'media' });

    for (const [n, target] of [
      [5, 4],
      [6, 5],
      [7, 7],
    ] as const) {
      const done = await stub.command(pip.id, {
        opId: op(10 + n),
        kind: 'unsend',
        payload: { target },
      });
      expect(done).toMatchObject({ result: 'ack' });
    }
    expect((await eventAt(stub, 4)).payload).toEqual({
      tombstone: 'unsent',
      facts: { to: fig.id },
    });
    expect((await eventAt(stub, 5)).payload).toEqual({ tombstone: 'unsent' });
    expect((await eventAt(stub, 6)).payload).toEqual({ tombstone: 'unsent' });
    expect(await eventAt(stub, 4)).toMatchObject({ kind: 'dewdrop', actor: pip.id });
    expect(await env.MEDIA.head(pic.key)).toBeNull();
  });

  it('lets people unsend only their own words, once', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { stub } = await plantFarm(pip, [fig]);
    await stub.command(pip.id, { opId: op(1), kind: 'message', payload: { text: 'mine' } });
    const theirs = await stub.command(fig.id, {
      opId: op(2),
      kind: 'unsend',
      payload: { target: 4 },
    });
    expect(theirs).toMatchObject({ reason: 'not_allowed' });
    await stub.command(pip.id, { opId: op(3), kind: 'unsend', payload: { target: 4 } });
    const twice = await stub.command(pip.id, {
      opId: op(4),
      kind: 'unsend',
      payload: { target: 4 },
    });
    expect(twice).toMatchObject({ reason: 'gone' });
    const react = await stub.command(fig.id, {
      opId: op(5),
      kind: 'reaction',
      payload: { target: 4, reaction: 'sun' },
    });
    expect(react).toMatchObject({ reason: 'gone' });
  });
});

describe('safety removals', () => {
  it('tombstones under a rule with a null actor, and an appeal restores the original', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const pic = await photo(farm, 'bbbb');
    await stub.command(fig.id, { opId: op(1), ...pic, kind: 'media' });
    const socket = await TestSocket.open(farm);
    await socket.hello(pip, farm, 4);

    expect(await stub.removeEvent(4, 3)).toEqual({ ok: true, seq: 5 });
    const removal = (await socket.next('event')).event;
    expect(removal).toMatchObject({
      seq: 5,
      kind: 'unsend',
      actor: null,
      payload: { target: 4, by: 'safety' },
    });
    expect((await eventAt(stub, 4)).payload).toEqual({ tombstone: 'removed', rule: 3 });
    expect(await env.MEDIA.head(pic.key)).not.toBeNull();
    expect(await stub.removeEvent(4, 3)).toEqual({ ok: false, reason: 'gone' });
    expect((await searchOf(stub, 'allotment')).results).toEqual([]);

    expect(await stub.restoreEvent(4)).toEqual({ ok: true, seq: 6 });
    const restored = (await socket.next('event')).event;
    expect(restored).toMatchObject({ kind: 'restored', actor: null, payload: { target: 4 } });
    expect((await eventAt(stub, 4)).payload).toEqual(pic.payload);
    expect((await searchOf(stub, 'allotment')).results.map((r) => r.seq)).toEqual([4]);
    expect(await stub.restoreEvent(4)).toEqual({ ok: false, reason: 'not_found' });
    socket.close();
  });

  it('follows a removed critter change with one restoring the previous name, on the person’s behalf', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { stub } = await plantFarm(pip, [fig]);
    await stub.command(fig.id, {
      opId: op(1),
      kind: 'critter_changed',
      payload: { name: 'Rude name' },
    });
    expect(await stub.removeEvent(4, 2)).toMatchObject({ ok: true, seq: 5 });
    const [, follow] = await tail(stub, 2);
    expect(follow).toMatchObject({
      seq: 6,
      kind: 'critter_changed',
      actor: fig.id,
      payload: { name: 'Fig' },
    });
    expect(follow?.opId).not.toBe(op(1));
    expect((await stub.state())?.members.find((m) => m.person === fig.id)?.name).toBe('Fig');
  });

  it('follows a removed rain cloud with the cloud lowered, and a removed plan edit with the plan as it was', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { stub } = await plantFarm(pip, [fig]);
    await stub.command(fig.id, {
      opId: op(1),
      kind: 'status',
      payload: { status: 'cloud', raised: true },
    });
    await stub.removeEvent(4, 2);
    expect((await tail(stub, 1))[0]).toMatchObject({
      kind: 'status',
      actor: fig.id,
      payload: { status: 'cloud', raised: false },
    });

    const plan = {
      title: 'Picnic',
      days: [],
      place: null,
      yeses: 'couple' as const,
      someday: false,
    };
    await stub.command(pip.id, { opId: op(2), kind: 'seed_planted', payload: plan });
    const seed = (await tail(stub, 1))[0]?.seq ?? 0;
    await stub.command(fig.id, {
      opId: op(3),
      kind: 'seed_changed',
      payload: { seed, title: 'Something rude' },
    });
    await stub.removeEvent(seed + 1, 2);
    const [removal, follow] = await tail(stub, 2);
    expect(removal).toMatchObject({ kind: 'unsend', actor: null });
    expect(follow).toMatchObject({
      kind: 'seed_changed',
      actor: fig.id,
      payload: { seed, title: 'Picnic' },
    });
    expect((await stub.state())?.seeds.find((s) => s.seq === seed)?.title).toBe('Picnic');
  });

  it('removes a member with their media, and pauses and freezes with a null actor', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const pic = await photo(farm, 'cccc');
    await stub.command(fig.id, { opId: op(1), ...pic, kind: 'media' });
    expect(await stub.pause(pip.id, 9_999_999_999_999)).toMatchObject({ ok: true });
    const paused = await stub.command(pip.id, { opId: op(2), kind: 'dewdrop', payload: {} });
    expect(paused).toMatchObject({ reason: 'account_paused' });
    expect(await stub.removeMember(fig.id, true)).toMatchObject({ ok: true });
    expect((await eventAt(stub, 4)).payload).toEqual({ tombstone: 'removed' });
    expect(await env.MEDIA.head(pic.key)).toBeNull();
    expect(await stub.freeze(true)).toMatchObject({ ok: true });
    const kinds = (await pageOf(stub, { after: 4, limit: 10 })).events.map((e) => [
      e.kind,
      e.actor,
    ]);
    expect(kinds).toEqual([
      ['settings_changed', null],
      ['removed', null],
      ['settings_changed', null],
    ]);
  });
});

describe('account deletion', () => {
  it('writes left, tombstones everything the person wrote with its facts, and deletes their media', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    await stub.command(fig.id, { opId: op(1), kind: 'message', payload: { text: 'hello' } });
    await stub.command(fig.id, { opId: op(2), kind: 'dewdrop', payload: { to: pip.id } });
    const pic = await photo(farm, 'dddd');
    await stub.command(fig.id, { opId: op(3), ...pic, kind: 'media' });
    await stub.command(pip.id, { opId: op(4), kind: 'message', payload: { text: 'pip stays' } });
    const socket = await TestSocket.open(farm);
    await socket.hello(fig, farm, 7);

    await stub.deleteAccount(fig.id);
    const left = await socket.next('event');
    expect(left).toMatchObject({
      event: { seq: 8, kind: 'left', actor: fig.id, payload: { how: 'account_deleted' } },
    });
    expect(await socket.next('error')).toEqual({ type: 'error', code: 'not_member' });
    const events = (await pageOf(stub, { limit: 20 })).events.map((e) => FarmEvent.parse(e));
    const payloads = Object.fromEntries(events.map((e) => [e.seq, e.payload]));
    expect(payloads[3]).toEqual({
      tombstone: 'author_deleted',
      facts: { critter: fig.critter, via: 'invite' },
    });
    expect(payloads[4]).toEqual({ tombstone: 'author_deleted' });
    expect(payloads[5]).toEqual({ tombstone: 'author_deleted', facts: { to: pip.id } });
    expect(payloads[6]).toEqual({ tombstone: 'author_deleted' });
    expect(payloads[7]).toEqual({ text: 'pip stays' });
    expect(await env.MEDIA.head(pic.key)).toBeNull();
    const former = (await stub.state())?.former;
    expect(former).toEqual([
      expect.objectContaining({ person: fig.id, name: null, how: 'account_deleted' }),
    ]);
  });

  it('tombstones a visitor’s gate events on a farm they only visited, then writes their left', async () => {
    const { pip, kit } = await cast('pip', 'kit');
    const { stub } = await plantFarm(pip);
    const wave = await stub.atGate(kit.id, profile(kit), op(1), { gesture: 'wave' });
    expect(wave).toMatchObject({ result: 'ack', seq: 3 });
    await stub.deleteAccount(kit.id);
    expect((await eventAt(stub, 3)).payload).toEqual({
      tombstone: 'author_deleted',
      facts: { action: 'wave' },
    });
    expect(await eventAt(stub, 4)).toMatchObject({
      kind: 'left',
      actor: kit.id,
      payload: { how: 'account_deleted' },
    });
    await stub.deleteAccount((await cast('mo')).mo.id);
    expect((await pageOf(stub, { limit: 10 })).events).toHaveLength(4);
  });
});
