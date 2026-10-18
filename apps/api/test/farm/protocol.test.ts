import { FarmEvent, parseEvent, PROTOCOL_VERSION } from '@kithfield/contracts';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FarmDO } from '../../src/farm/farm-object';
import { messageFrame, op, TestSocket } from './support/client';
import { plantFarm, tokenFor, useTestPorts } from './support/doubles';

beforeEach(() => {
  useTestPorts();
});

/** Writes `count` messages from Pip straight into the object. */
const writeMessages = (stub: DurableObjectStub<FarmDO>, count: number, from = 1) =>
  runInDurableObject(stub, async (farm) => {
    for (let n = from; n < from + count; n++) {
      const result = await farm.command('pip', {
        opId: op(n),
        kind: 'message',
        payload: { text: `note ${n}` },
      });
      expect(result.result).toBe('ack');
    }
  });

describe('hello', () => {
  it('sends a phone that holds nothing the snapshot, then the events after it', async () => {
    const { farm } = await plantFarm(['fig']);
    const socket = await TestSocket.open(farm);
    const caught = await socket.hello('pip', farm, 0);
    expect(caught.error).toBeNull();
    expect(caught.snapshot?.seq).toBe(3);
    expect(caught.snapshot?.state.members.map((m) => m.person)).toEqual(['pip', 'fig']);
    expect(caught.batches).toEqual([{ type: 'events', events: [], more: false }]);
    expect(await socket.next('presence')).toEqual({ type: 'presence', here: [] });
    socket.close();
  });

  it('starts the log with farm_created at seq 1, written by the farm', async () => {
    const { stub } = await plantFarm([]);
    const page = await stub.page({ after: 0, limit: 10 });
    expect(FarmEvent.parse(page.events[0])).toMatchObject({
      seq: 1,
      kind: 'farm_created',
      actor: null,
      rulesVersion: 1,
    });
    expect(page.events.map((e) => e.kind)).toEqual(['farm_created', 'joined']);
  });

  it.each([
    [
      'a token for another farm',
      (farm: string) => ({ token: tokenFor('pip', `${farm}x`) }),
      'unauthorized',
    ],
    ['a hello that doesn’t parse', () => ({ lastSeq: -1 }), 'unauthorized'],
    ['a newer protocol', () => ({ protocol: PROTOCOL_VERSION + 1 }), 'protocol_unsupported'],
  ])('closes the socket for %s', async (_name, change, code) => {
    const { farm } = await plantFarm([]);
    const socket = await TestSocket.open(farm);
    const hello = {
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      token: tokenFor('pip', farm),
      lastSeq: 0,
      rulesVersion: 1,
    };
    socket.send({ ...hello, ...change(farm) });
    expect(await socket.next('error')).toEqual({ type: 'error', code });
    expect((await socket.waitClosed()).reason).toBe(code);
  });

  it('tells an app whose reducer is older than the farm’s rules to update', async () => {
    useTestPorts({ rulesVersion: 2 });
    const { farm } = await plantFarm([]);
    const socket = await TestSocket.open(farm);
    expect((await socket.hello('pip', farm, 0, 1)).error).toBe('rules_outdated');
    expect((await socket.waitClosed()).reason).toBe('rules_outdated');
  });

  it('turns away someone who doesn’t live on the farm', async () => {
    const { farm } = await plantFarm([]);
    expect((await (await TestSocket.open(farm)).hello('kit', farm)).error).toBe('not_member');
  });

  it('answers farm_gone where no farm was planted', async () => {
    expect((await (await TestSocket.open('nofarmhere')).hello('pip', 'nofarmhere')).error).toBe(
      'farm_gone',
    );
  });

  it('says nothing about whether a farm exists to a socket without a token for it', async () => {
    const socket = await TestSocket.open('nofarmhere');
    socket.send({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      token: tokenFor('pip', 'elsewhere'),
      lastSeq: 0,
      rulesVersion: 1,
    });
    expect(await socket.next('error')).toEqual({ type: 'error', code: 'unauthorized' });
  });

  it('refuses anything before hello', async () => {
    const { farm } = await plantFarm([]);
    const socket = await TestSocket.open(farm);
    socket.send(messageFrame(1));
    expect(await socket.next('error')).toEqual({ type: 'error', code: 'unauthorized' });
  });

  it('answers ping with pong as plain text', async () => {
    const { farm } = await plantFarm([]);
    const socket = await TestSocket.open(farm);
    socket.send('ping');
    await socket.drain();
    expect(socket.text).toEqual(['pong']);
    socket.close();
  });
});

describe('catching up', () => {
  it('replays only what a reconnecting phone missed, oldest first, without a snapshot', async () => {
    const { farm, stub } = await plantFarm(['fig']);
    const first = await TestSocket.open(farm);
    await first.hello('fig', farm, 0);
    first.close();
    await writeMessages(stub, 5);
    const again = await TestSocket.open(farm);
    const caught = await again.hello('fig', farm, 3);
    expect(caught.snapshot).toBeNull();
    expect(caught.events?.map((e) => e.seq)).toEqual([4, 5, 6, 7, 8]);
    expect(caught.events?.every((e) => parseEvent(e).status === 'known')).toBe(true);
    expect(caught.batches.at(-1)?.more).toBe(false);
    again.close();
  });

  it('sends a phone already up to date one empty last batch', async () => {
    const { farm } = await plantFarm([]);
    const socket = await TestSocket.open(farm);
    expect((await socket.hello('pip', farm, 2)).batches).toEqual([
      { type: 'events', events: [], more: false },
    ]);
    socket.close();
  });

  it('sends up to 500 missed events in batches of 200 with `more`', async () => {
    const { farm, stub } = await plantFarm([]);
    await writeMessages(stub, 450);
    const socket = await TestSocket.open(farm);
    const caught = await socket.hello('pip', farm, 2);
    expect(caught.snapshot).toBeNull();
    expect(caught.batches.map((b) => [b.events.length, b.more])).toEqual([
      [200, true],
      [200, true],
      [50, false],
    ]);
    expect(caught.events?.[0]?.seq).toBe(3);
    expect(caught.events?.at(-1)?.seq).toBe(452);
    socket.close();
  });

  it('sends the snapshot to a phone more than 500 events behind', async () => {
    const { farm, stub } = await plantFarm([]);
    await writeMessages(stub, 510);
    const socket = await TestSocket.open(farm);
    const caught = await socket.hello('pip', farm, 2);
    expect(caught.snapshot?.seq).toBe(512);
    expect(caught.events).toEqual([]);
    socket.close();
  });

  it('sends the snapshot to a phone that claims more than the farm has', async () => {
    const { farm } = await plantFarm([]);
    const socket = await TestSocket.open(farm);
    expect((await socket.hello('pip', farm, 99)).snapshot?.seq).toBe(2);
    socket.close();
  });
});

describe('hibernation', () => {
  it('rebuilds the farm after the object is evicted, and its sockets keep working', async () => {
    const { farm, stub } = await plantFarm(['fig']);
    const pip = await TestSocket.open(farm);
    await pip.hello('pip', farm, 3);
    pip.send(messageFrame(1));
    expect(await pip.next('ack')).toMatchObject({ seq: 4 });
    await evictDurableObject(stub);

    pip.send('ping');
    pip.send(messageFrame(2));
    expect(await pip.next('ack')).toEqual({ type: 'ack', opId: op(2), seq: 5 });
    expect(pip.text).toEqual(['pong']);
    pip.send(messageFrame(1));
    expect(await pip.next('ack')).toEqual({ type: 'ack', opId: op(1), seq: 4 });
    expect((await stub.state())?.members.map((m) => m.person)).toEqual(['pip', 'fig']);
    pip.close();
  });

  it('writes rules_changed when it wakes under newer rules', async () => {
    const { farm, stub } = await plantFarm([]);
    useTestPorts({ rulesVersion: 2 });
    await evictDurableObject(stub);
    const socket = await TestSocket.open(farm);
    const caught = await socket.hello('pip', farm, 2, 2);
    expect(caught.events?.map((e) => [e.kind, e.payload, e.rulesVersion])).toEqual([
      ['rules_changed', { from: 1, to: 2 }, 2],
    ]);
    socket.send(messageFrame(1));
    expect(parseEvent((await socket.next('event')).event)).toMatchObject({
      event: { seq: 4, rulesVersion: 2 },
    });
    socket.close();
  });
});
