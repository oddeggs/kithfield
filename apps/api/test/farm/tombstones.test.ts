import { FarmEvent } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { op, TestSocket } from './support/client';
import { plantFarm, PROFILES, useTestPorts } from './support/doubles';

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

const eventAt = async (stub: Awaited<ReturnType<typeof plantFarm>>['stub'], seq: number) =>
  FarmEvent.parse((await stub.page({ after: seq - 1, limit: 1 })).events[0]);

describe('unsend', () => {
  it('turns the target into a tombstone that keeps its facts, with its edits and media', async () => {
    const { farm, stub } = await plantFarm(['fig']);
    await stub.command('pip', { opId: op(1), kind: 'dewdrop', payload: { to: 'fig' } });
    await stub.command('pip', { opId: op(2), kind: 'message', payload: { text: 'secret plans' } });
    await stub.command('pip', {
      opId: op(3),
      kind: 'edit',
      payload: { target: 5, text: 'secret plans!' },
    });
    const pic = await photo(farm, 'aaaa');
    await stub.command('pip', { opId: op(4), ...pic, kind: 'media' });

    for (const [n, target] of [
      [5, 4],
      [6, 5],
      [7, 7],
    ] as const) {
      expect(
        await stub.command('pip', { opId: op(10 + n), kind: 'unsend', payload: { target } }),
      ).toMatchObject({ result: 'ack' });
    }
    expect((await eventAt(stub, 4)).payload).toEqual({ tombstone: 'unsent', facts: { to: 'fig' } });
    expect((await eventAt(stub, 5)).payload).toEqual({ tombstone: 'unsent' });
    expect((await eventAt(stub, 6)).payload).toEqual({ tombstone: 'unsent' });
    expect(await eventAt(stub, 4)).toMatchObject({ kind: 'dewdrop', actor: 'pip' });
    expect(await env.MEDIA.head(pic.key)).toBeNull();
  });

  it('lets people unsend only their own words, once', async () => {
    const { stub } = await plantFarm(['fig']);
    await stub.command('pip', { opId: op(1), kind: 'message', payload: { text: 'mine' } });
    expect(
      await stub.command('fig', { opId: op(2), kind: 'unsend', payload: { target: 4 } }),
    ).toMatchObject({ reason: 'not_allowed' });
    await stub.command('pip', { opId: op(3), kind: 'unsend', payload: { target: 4 } });
    expect(
      await stub.command('pip', { opId: op(4), kind: 'unsend', payload: { target: 4 } }),
    ).toMatchObject({ reason: 'gone' });
    expect(
      await stub.command('fig', {
        opId: op(5),
        kind: 'reaction',
        payload: { target: 4, reaction: 'sun' },
      }),
    ).toMatchObject({ reason: 'gone' });
  });
});

describe('safety removals', () => {
  it('tombstones under a rule with a null actor, and an appeal restores the original', async () => {
    const { farm, stub } = await plantFarm(['fig']);
    const pic = await photo(farm, 'bbbb');
    await stub.command('fig', { opId: op(1), ...pic, kind: 'media' });
    const socket = await TestSocket.open(farm);
    await socket.hello('pip', farm, 4);

    expect(await stub.removeEvent(4, 3)).toEqual({ ok: true, seq: 5 });
    expect((await socket.next('event')).event).toMatchObject({
      seq: 5,
      kind: 'unsend',
      actor: null,
      payload: { target: 4, by: 'safety' },
    });
    expect((await eventAt(stub, 4)).payload).toEqual({ tombstone: 'removed', rule: 3 });
    expect(await env.MEDIA.head(pic.key)).not.toBeNull();
    expect(await stub.removeEvent(4, 3)).toEqual({ ok: false, reason: 'gone' });
    expect((await stub.search('allotment')).results).toEqual([]);

    expect(await stub.restoreEvent(4)).toEqual({ ok: true, seq: 6 });
    expect((await socket.next('event')).event).toMatchObject({
      kind: 'restored',
      actor: null,
      payload: { target: 4 },
    });
    expect((await eventAt(stub, 4)).payload).toEqual(pic.payload);
    expect((await stub.search('allotment')).results.map((r) => r.seq)).toEqual([4]);
    expect(await stub.restoreEvent(4)).toEqual({ ok: false, reason: 'not_found' });
    socket.close();
  });

  it('removes a member with their media, and pauses and freezes with a null actor', async () => {
    const { farm, stub } = await plantFarm(['fig']);
    const pic = await photo(farm, 'cccc');
    await stub.command('fig', { opId: op(1), ...pic, kind: 'media' });
    expect(await stub.pause('pip', 9_999_999_999_999)).toMatchObject({ ok: true });
    expect(await stub.command('pip', { opId: op(2), kind: 'dewdrop', payload: {} })).toMatchObject({
      reason: 'account_paused',
    });
    expect(await stub.removeMember('fig', true)).toMatchObject({ ok: true });
    expect((await eventAt(stub, 4)).payload).toEqual({ tombstone: 'removed' });
    expect(await env.MEDIA.head(pic.key)).toBeNull();
    expect(await stub.freeze(true)).toMatchObject({ ok: true });
    const kinds = (await stub.page({ after: 4, limit: 10 })).events.map((e) => [e.kind, e.actor]);
    expect(kinds).toEqual([
      ['settings_changed', null],
      ['removed', null],
      ['settings_changed', null],
    ]);
  });
});

describe('account deletion', () => {
  it('writes left, tombstones everything the person wrote with its facts, and deletes their media', async () => {
    const { farm, stub } = await plantFarm(['fig']);
    await stub.command('fig', { opId: op(1), kind: 'message', payload: { text: 'hello' } });
    await stub.command('fig', { opId: op(2), kind: 'dewdrop', payload: { to: 'pip' } });
    const pic = await photo(farm, 'dddd');
    await stub.command('fig', { opId: op(3), ...pic, kind: 'media' });
    await stub.command('pip', { opId: op(4), kind: 'message', payload: { text: 'pip stays' } });
    const fig = await TestSocket.open(farm);
    await fig.hello('fig', farm, 7);

    await stub.deleteAccount('fig');
    expect(await fig.next('event')).toMatchObject({
      event: { seq: 8, kind: 'left', actor: 'fig', payload: { how: 'account_deleted' } },
    });
    expect(await fig.next('error')).toEqual({ type: 'error', code: 'not_member' });
    const events = (await stub.page({ limit: 20 })).events.map((e) => FarmEvent.parse(e));
    const payloads = Object.fromEntries(events.map((e) => [e.seq, e.payload]));
    expect(payloads[3]).toEqual({ tombstone: 'author_deleted' });
    expect(payloads[4]).toEqual({ tombstone: 'author_deleted' });
    expect(payloads[5]).toEqual({ tombstone: 'author_deleted', facts: { to: 'pip' } });
    expect(payloads[6]).toEqual({ tombstone: 'author_deleted' });
    expect(payloads[7]).toEqual({ text: 'pip stays' });
    expect(await env.MEDIA.head(pic.key)).toBeNull();
    expect((await stub.state())?.former).toEqual([
      expect.objectContaining({ person: 'fig', name: null, how: 'account_deleted' }),
    ]);
  });

  it('tombstones a visitor’s gate events on a farm they only visited', async () => {
    const { stub } = await plantFarm([]);
    expect(await stub.atGate('kit', PROFILES['kit']!, op(1), { gesture: 'wave' })).toMatchObject({
      result: 'ack',
      seq: 3,
    });
    await stub.deleteAccount('kit');
    expect((await eventAt(stub, 3)).payload).toEqual({
      tombstone: 'author_deleted',
      facts: { action: 'wave' },
    });
    expect((await stub.page({ limit: 10 })).events).toHaveLength(3);
  });
});
