import { FarmEvent, parseEvent, PROTOCOL_VERSION } from '@kithfield/contracts';
import { RULES_VERSION } from '@kithfield/farm';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FarmDO } from '../../src/farm/farm-object';
import { messageFrame, op, TestSocket } from './support/client';
import { cast, plantFarm, socketToken, useTestPorts, pageOf } from './support/doubles';

beforeEach(() => {
  useTestPorts();
});

/** Hundreds of writes, each handed to the cottages, take longer than the default 5 seconds. */
const BULK_MS = 30_000;

/** Writes `count` messages from `person` straight into the object. */
const writeMessages = (stub: DurableObjectStub<FarmDO>, person: string, count: number) =>
  runInDurableObject(stub, async (farm) => {
    for (let n = 1; n <= count; n++) {
      const result = await farm.command(person, {
        opId: op(n),
        kind: 'message',
        payload: { text: `note ${n}` },
      });
      expect(result.result).toBe('ack');
    }
  });

const helloFrame = async (person: Parameters<typeof socketToken>[0], farm: string) => ({
  type: 'hello',
  protocol: PROTOCOL_VERSION,
  token: await socketToken(person, farm),
  lastSeq: 0,
  rulesVersion: RULES_VERSION,
});

describe('hello', () => {
  it('sends a phone that holds nothing the snapshot, then the events after it', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm } = await plantFarm(pip, [fig]);
    const socket = await TestSocket.open(farm);
    const caught = await socket.hello(pip, farm, 0);
    expect(caught.error).toBeNull();
    expect(caught.snapshot?.seq).toBe(3);
    expect(caught.snapshot?.state.members.map((m) => m.person)).toEqual([pip.id, fig.id]);
    expect(caught.snapshot?.state.rulesVersion).toBe(RULES_VERSION);
    expect(caught.batches).toEqual([{ type: 'events', events: [], more: false }]);
    expect(await socket.next('presence')).toEqual({ type: 'presence', here: [] });
    socket.close();
  });

  it('starts the log with farm_created at seq 1, and stamps every event with its farm day', async () => {
    const { pip } = await cast('pip');
    const { stub } = await plantFarm(pip);
    const events = (await pageOf(stub, { after: 0, limit: 10 })).events.map((e) =>
      FarmEvent.parse(e),
    );
    expect(events.map((e) => [e.seq, e.kind, e.actor, e.day, e.rulesVersion])).toEqual([
      [1, 'farm_created', null, '2054-10-18', RULES_VERSION],
      [2, 'joined', pip.id, '2054-10-18', RULES_VERSION],
    ]);
  });

  it.each([
    ['a token for another farm', { farm: 'otherfarm' }, 'unauthorized'],
    ['a hello that doesn’t parse', { lastSeq: -1 }, 'unauthorized'],
    ['a newer protocol', { protocol: PROTOCOL_VERSION + 1 }, 'protocol_unsupported'],
    [
      'an app whose reducer is older than the farm’s rules',
      { rulesVersion: RULES_VERSION - 1 },
      'rules_outdated',
    ],
  ])('closes the socket for %s', async (_name, change, code) => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const socket = await TestSocket.open(farm);
    const { farm: tokenFarm, ...rest } = change as { farm?: string };
    const hello = await helloFrame(pip, tokenFarm ?? farm);
    socket.send({ ...hello, ...rest });
    expect(await socket.next('error')).toEqual({ type: 'error', code });
    expect((await socket.waitClosed()).reason).toBe(code);
  });

  it('turns away someone who doesn’t live on the farm', async () => {
    const { pip, kit } = await cast('pip', 'kit');
    const { farm } = await plantFarm(pip);
    expect((await (await TestSocket.open(farm)).hello(kit, farm)).error).toBe('not_member');
  });

  it('answers farm_gone where no farm was planted, but only to a token for it', async () => {
    const { pip } = await cast('pip');
    expect((await (await TestSocket.open('nofarmhere')).hello(pip, 'nofarmhere')).error).toBe(
      'farm_gone',
    );
    const socket = await TestSocket.open('nofarmhere');
    socket.send({ ...(await helloFrame(pip, 'elsewhere')) });
    expect(await socket.next('error')).toEqual({ type: 'error', code: 'unauthorized' });
  });

  it('refuses anything before hello', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const socket = await TestSocket.open(farm);
    socket.send(messageFrame(1));
    expect(await socket.next('error')).toEqual({ type: 'error', code: 'unauthorized' });
  });

  it('answers ping with pong as plain text', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const socket = await TestSocket.open(farm);
    socket.send('ping');
    await socket.drain();
    expect(socket.text).toEqual(['pong']);
    socket.close();
  });
});

describe('catching up', () => {
  it('replays only what a reconnecting phone missed, oldest first, without a snapshot', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const first = await TestSocket.open(farm);
    await first.hello(fig, farm, 0);
    first.close();
    await writeMessages(stub, pip.id, 5);
    const again = await TestSocket.open(farm);
    const caught = await again.hello(fig, farm, 3);
    expect(caught.snapshot).toBeNull();
    expect(caught.events?.map((e) => e.seq)).toEqual([4, 5, 6, 7, 8]);
    expect(caught.events?.every((e) => parseEvent(e).status === 'known')).toBe(true);
    expect(caught.batches.at(-1)?.more).toBe(false);
    again.close();
  });

  it('sends a phone already up to date one empty last batch', async () => {
    const { pip } = await cast('pip');
    const { farm } = await plantFarm(pip);
    const socket = await TestSocket.open(farm);
    expect((await socket.hello(pip, farm, 2)).batches).toEqual([
      { type: 'events', events: [], more: false },
    ]);
    socket.close();
  });

  it(
    'sends up to 500 missed events in batches of 200 with `more`',
    async () => {
      const { pip } = await cast('pip');
      const { farm, stub } = await plantFarm(pip);
      await writeMessages(stub, pip.id, 450);
      const socket = await TestSocket.open(farm);
      const caught = await socket.hello(pip, farm, 2);
      expect(caught.snapshot).toBeNull();
      expect(caught.batches.map((b) => [b.events.length, b.more])).toEqual([
        [200, true],
        [200, true],
        [50, false],
      ]);
      expect(caught.events?.[0]?.seq).toBe(3);
      expect(caught.events?.at(-1)?.seq).toBe(452);
      socket.close();
    },
    BULK_MS,
  );

  it(
    'sends the snapshot to a phone more than 500 events behind, or ahead of the farm',
    async () => {
      const { pip } = await cast('pip');
      const { farm, stub } = await plantFarm(pip);
      await writeMessages(stub, pip.id, 510);
      const behind = await TestSocket.open(farm);
      const caught = await behind.hello(pip, farm, 2);
      expect(caught.snapshot?.seq).toBe(512);
      expect(caught.events).toEqual([]);
      const ahead = await TestSocket.open(farm);
      expect((await ahead.hello(pip, farm, 999)).snapshot?.seq).toBe(512);
      behind.close();
      ahead.close();
    },
    BULK_MS,
  );
});

describe('hibernation', () => {
  it('rebuilds the farm after the object is evicted, and its sockets keep working', async () => {
    const { pip, fig } = await cast('pip', 'fig');
    const { farm, stub } = await plantFarm(pip, [fig]);
    const socket = await TestSocket.open(farm);
    await socket.hello(pip, farm, 3);
    socket.send(messageFrame(1));
    expect(await socket.next('ack')).toMatchObject({ seq: 4 });
    await evictDurableObject(stub);

    socket.send('ping');
    socket.send(messageFrame(2));
    expect(await socket.next('ack')).toEqual({ type: 'ack', opId: op(2), seq: 5 });
    expect(socket.text).toEqual(['pong']);
    socket.send(messageFrame(1));
    expect(await socket.next('ack')).toEqual({ type: 'ack', opId: op(1), seq: 4 });
    expect((await stub.state())?.members.map((m) => m.person)).toEqual([pip.id, fig.id]);
    socket.close();
  });

  it('writes rules_changed when it wakes under newer rules', async () => {
    useTestPorts({ rulesVersion: RULES_VERSION - 1 });
    const { pip } = await cast('pip');
    const { farm, stub } = await plantFarm(pip);
    useTestPorts();
    await evictDurableObject(stub);
    const socket = await TestSocket.open(farm);
    const caught = await socket.hello(pip, farm, 2);
    expect(caught.events?.map((e) => [e.kind, e.payload, e.rulesVersion])).toEqual([
      ['rules_changed', { from: RULES_VERSION - 1, to: RULES_VERSION }, RULES_VERSION],
    ]);
    socket.send(messageFrame(1));
    const next = parseEvent((await socket.next('event')).event);
    expect(next).toMatchObject({ status: 'known', event: { seq: 4, rulesVersion: RULES_VERSION } });
    socket.close();
  });
});
