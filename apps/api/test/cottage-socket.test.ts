import { CottageServerFrame, PROTOCOL_VERSION } from '@kithfield/contracts';
import { evictDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useCottageAdapters } from '../src/cottage/adapters';
import { cottageOf } from '../src/cottage/stub';

import {
  cottageWithFarm,
  freshPerson,
  MIDDAY,
  useTestClock,
  recordPushQueue,
  testRtToken,
  useTestSignInDouble,
} from './cottage-doubles';

beforeAll(() => useTestSignInDouble());
beforeEach(() => {
  useTestClock(MIDDAY);
});

/** Opens the cottage socket the way the phone does, collecting what it hears. */
async function openSocket(person: string) {
  const response = await exports.default.fetch(
    `https://dev.kithfield.com/api/v1/cottage/${person}/socket`,
    { headers: { Upgrade: 'websocket' } },
  );
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  const heard: unknown[] = [];
  const waiters: (() => void)[] = [];
  let closed: { code: number; reason: string } | null = null;
  ws.addEventListener('message', (event) => {
    heard.push(event.data === 'pong' ? 'pong' : JSON.parse(String(event.data)));
    waiters.splice(0).forEach((wake) => wake());
  });
  ws.addEventListener('close', (event) => {
    closed = { code: event.code, reason: event.reason };
    waiters.splice(0).forEach((wake) => wake());
  });
  ws.accept();
  const next = async (count: number) => {
    while (heard.length < count && closed === null) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    return heard.slice(0, count);
  };
  return { ws, heard, next, closed: () => closed };
}

const hello = (token: string, protocol = PROTOCOL_VERSION) =>
  JSON.stringify({ type: 'hello', protocol, token });

describe('the cottage socket', () => {
  it('sends the whole chat list after hello, then each changed row', async () => {
    recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver({
      farm: 'farm-a',
      seq: 2,
      kind: 'message',
      actor: 'otis',
      at: 1_000,
      preview: 'picnic saturday?',
      forYou: false,
      connected: false,
    });

    const socket = await openSocket(person);
    socket.ws.send(hello(testRtToken(person)));
    const [chats] = await socket.next(1);
    expect(CottageServerFrame.parse(chats)).toEqual({
      type: 'chats',
      chats: [
        {
          farm: 'farm-a',
          seq: 2,
          kind: 'message',
          actor: 'otis',
          at: 1_000,
          preview: 'picnic saturday?',
          forYou: false,
          farmKind: 'farm',
          name: 'The Thursday Lot',
          with: null,
          waiting: 0,
          muted: false,
          pinned: false,
        },
      ],
    });

    await cottage.deliver({
      farm: 'farm-a',
      seq: 3,
      kind: 'firefly',
      actor: 'otis',
      at: 2_000,
      preview: null,
      forYou: true,
      connected: false,
    });
    const [, chat] = await socket.next(2);
    expect(CottageServerFrame.parse(chat)).toMatchObject({
      type: 'chat',
      chat: { farm: 'farm-a', seq: 3, kind: 'firefly', forYou: true, waiting: 1 },
    });

    await cottage.noteSafety();
    const [, , note] = await socket.next(3);
    expect(note).toEqual({ type: 'safety_note' });
    socket.ws.close(1000);
  });

  it('keeps an authenticated socket through hibernation', async () => {
    recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    const socket = await openSocket(person);
    socket.ws.send(hello(testRtToken(person)));
    await socket.next(1);

    await evictDurableObject(cottage);
    await cottage.deliver({
      farm: 'farm-a',
      seq: 2,
      kind: 'joined',
      actor: 'dot',
      at: 3_000,
      preview: null,
      forYou: false,
      connected: false,
    });
    const [, chat] = await socket.next(2);
    expect(chat).toMatchObject({ type: 'chat', chat: { seq: 2, kind: 'joined' } });
    socket.ws.close(1000);
  });

  it('answers ping with pong without a JSON frame', async () => {
    const person = freshPerson();
    const socket = await openSocket(person);
    socket.ws.send('ping');
    expect(await socket.next(1)).toEqual(['pong']);
    socket.ws.close(1000);
  });

  it('refuses a token for someone else, a farm token and a bad token', async () => {
    const person = freshPerson();
    for (const token of [
      testRtToken('someone-else'),
      testRtToken(person, 'farm-a'),
      'not-a-token-at-all-really',
    ]) {
      const socket = await openSocket(person);
      socket.ws.send(hello(token));
      expect(await socket.next(1)).toEqual([{ type: 'error', code: 'unauthorized' }]);
      await socket.next(2);
      expect(socket.closed()).toMatchObject({ code: 1008 });
    }
  });

  it('refuses a token the verifier says is someone else’s, whatever the scope', async () => {
    const person = freshPerson();
    useCottageAdapters({ verifyRtToken: () => Promise.resolve('someone-else') });
    const socket = await openSocket(person);
    socket.ws.send(hello(testRtToken(person)));
    expect(await socket.next(1)).toEqual([{ type: 'error', code: 'unauthorized' }]);
    useTestSignInDouble();
  });

  it('refuses anything before hello, and a protocol it cannot serve', async () => {
    const person = freshPerson();
    const early = await openSocket(person);
    early.ws.send(JSON.stringify({ type: 'chats' }));
    expect(await early.next(1)).toEqual([{ type: 'error', code: 'unauthorized' }]);

    const future = await openSocket(person);
    future.ws.send(hello(testRtToken(person), PROTOCOL_VERSION + 1));
    expect(await future.next(1)).toEqual([{ type: 'error', code: 'protocol_unsupported' }]);
  });

  it('closes a socket that says no hello within 30 seconds', async () => {
    const person = freshPerson();
    const socket = await openSocket(person);
    useTestClock('2026-10-18T12:00:20Z');
    await runDurableObjectAlarm(cottageOf(env, person));
    expect(socket.closed()).toBeNull();
    useTestClock('2026-10-18T12:00:31Z');
    await runDurableObjectAlarm(cottageOf(env, person));
    expect(await socket.next(1)).toEqual([{ type: 'error', code: 'unauthorized' }]);
    await socket.next(2);
    expect(socket.closed()).toMatchObject({ code: 1008 });
  });

  it('closes every socket on sign-out, a ban or deletion', async () => {
    const person = freshPerson();
    const socket = await openSocket(person);
    socket.ws.send(hello(testRtToken(person)));
    await socket.next(1);
    await cottageOf(env, person).closeSockets('banned');
    expect((await socket.next(2))[1]).toEqual({ type: 'error', code: 'banned' });
    await socket.next(3);
    expect(socket.closed()).toMatchObject({ code: 1008, reason: 'banned' });
  });

  it('keeps unauthenticated sockets out of the broadcast', async () => {
    recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    const lurker = await openSocket(person);
    await cottage.noteSafety();
    const ready = await openSocket(person);
    ready.ws.send(hello(testRtToken(person)));
    await ready.next(2);
    expect(ready.heard[1]).toEqual({ type: 'safety_note' });
    expect(lurker.heard).toEqual([]);
  });
});
