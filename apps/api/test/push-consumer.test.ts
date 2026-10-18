import type { PushJob } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';

import { cottageOf } from '../src/cottage/stub';
import { backoffSeconds, consumePush } from '../src/push/consumer';
import { EXPO_RECEIPTS_URL, EXPO_SEND_URL } from '../src/push/expo';
import type { ReceiptCheck } from '../src/push/queue';
import {
  cottageWithFarm,
  fakeExpoPushService,
  freshPerson,
  ledgerOf,
  okTickets,
  recordPushQueue,
} from './cottage-doubles';

const TOKEN = 'ExponentPushToken[june-phone]';

async function personWithPhone(lang: 'en' | 'vi' = 'en') {
  const person = freshPerson();
  const cottage = await cottageWithFarm(person, 'farm-a');
  await cottage.updateSettings({ lang });
  await cottage.registerDevice('phone-1', {
    platform: 'ios',
    name: 'June’s iPhone',
    pushToken: TOKEN,
    appVersion: '1.0.0 (1)',
  });
  return { person, cottage };
}

const jobFor = (person: string, over: Partial<PushJob> = {}): PushJob => ({
  person,
  farm: 'farm-a',
  kind: 'firefly',
  seq: 4,
  collapseKey: 'doorstep.20261018',
  copy: { key: 'push.doorstep.firefly', params: { name: 'Otis' } },
  forYou: true,
  at: Date.now(),
  ...over,
});

/** What `getQueueResult` reports (its own type ships only with the experimental Workers types). */
interface QueueOutcome {
  readonly explicitAcks: string[];
  readonly retryMessages: { msgId: string }[];
}

async function consume(bodies: unknown[], fetcher: typeof fetch, attempts = 1) {
  const batch = createMessageBatch(
    'kithfield-push-dev',
    bodies.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts, body })),
  );
  // The queue result says which messages were retried; their delays are read off the calls.
  const delays = batch.messages.map((message) => vi.spyOn(message, 'retry'));
  const ctx = createExecutionContext();
  await consumePush(batch, env, ctx, { fetch: fetcher, now: () => Date.now() });
  const result = (await getQueueResult(batch, ctx)) as unknown as QueueOutcome;
  const retryMessages = result.retryMessages.map(({ msgId }) => ({
    msgId,
    delaySeconds: delays[Number(msgId.slice(1))]!.mock.calls[0]?.[0]?.delaySeconds,
  }));
  return { ...result, retryMessages };
}

describe('the push consumer', () => {
  it('renders the copy in the person’s language and sends it through Expo', async () => {
    const queue = recordPushQueue();
    const { person } = await personWithPhone('vi');
    const expo = fakeExpoPushService(okTickets);
    const result = await consume([jobFor(person)], expo.fetch);

    expect(result.explicitAcks).toEqual(['m0']);
    expect(expo.calls).toEqual([
      {
        url: EXPO_SEND_URL,
        body: [
          {
            to: TOKEN,
            title: 'The Thursday Lot',
            body: 'Otis để lại một con đom đóm trước cửa nhà bạn. Không cần trả lời đâu.',
            data: { farm: 'farm-a', seq: 4, kind: 'firefly' },
            sound: 'default',
            collapseId: 'doorstep.20261018',
            tag: 'doorstep.20261018',
            threadId: 'farm-a',
            interruptionLevel: 'active',
            priority: 'high',
            ttl: 86_400,
          },
        ],
      },
    ]);
    expect(await ledgerOf(person)).toEqual([
      expect.objectContaining({ decision: 'sent', device: 'phone-1', ticket: 'ticket-0' }),
    ]);
    // The receipts are checked 15 minutes later.
    expect(queue.sent).toEqual([
      {
        body: { receipts: [{ ticket: 'ticket-0', person, device: 'phone-1', token: TOKEN }] },
        delaySeconds: 900,
      },
    ]);
  });

  it('reads "A friend" for a name it does not know, and puts a mention’s words after the name', async () => {
    recordPushQueue();
    const { person } = await personWithPhone();
    const expo = fakeExpoPushService(okTickets);
    await consume(
      [
        jobFor(person, {
          kind: 'message',
          collapseKey: 'mention.x.4',
          copy: { key: 'push.mention', params: { preview: 'you still have the folding chairs?' } },
        }),
      ],
      expo.fetch,
    );
    const [sent] = expo.calls[0]!.body as { body: string }[];
    expect(sent!.body).toBe('A friend: you still have the folding chairs?');
  });

  it('folds jobs with the same collapse key into one quiet "a few things" push', async () => {
    recordPushQueue();
    const { person } = await personWithPhone();
    const expo = fakeExpoPushService(okTickets);
    const result = await consume(
      [jobFor(person, { seq: 4 }), jobFor(person, { seq: 5, kind: 'gift' })],
      expo.fetch,
    );
    expect(result.explicitAcks.sort()).toEqual(['m0', 'm1']);
    const sent = expo.calls[0]!.body as Record<string, unknown>[];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      body: 'A few things are on your step.',
      interruptionLevel: 'passive',
      priority: 'normal',
    });
    expect(sent[0]).not.toHaveProperty('sound');
    expect((await ledgerOf(person)).map((r) => [r['seq'], r['decision'], r['collapsed']])).toEqual([
      [4, 'collapsed', 0],
      [5, 'sent', 1],
    ]);
  });

  it('checks once more before sending: a person who hibernated since gets nothing', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhone();
    await cottage.setHibernating(true);
    const expo = fakeExpoPushService(okTickets);
    const result = await consume([jobFor(person)], expo.fetch);
    expect(expo.calls).toEqual([]);
    expect(result.explicitAcks).toEqual(['m0']);
    expect(await ledgerOf(person)).toEqual([
      expect.objectContaining({ decision: 'skipped', reason: 'hibernating' }),
    ]);
  });

  it('drops a token Expo says is no longer registered', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhone();
    const expo = fakeExpoPushService(() =>
      Response.json({
        data: [{ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }],
      }),
    );
    const result = await consume([jobFor(person)], expo.fetch);
    expect(result.explicitAcks).toEqual(['m0']);
    expect((await cottage.listDevices())[0]!.pushToken).toBeNull();
    expect(await ledgerOf(person)).toEqual([
      expect.objectContaining({ decision: 'failed', reason: 'DeviceNotRegistered' }),
    ]);
  });

  it('retries with back-off when Expo is down or rate-limits, and the DLQ takes the rest', async () => {
    recordPushQueue();
    const { person } = await personWithPhone();
    const down = fakeExpoPushService(() => new Response('unavailable', { status: 503 }));
    const first = await consume([jobFor(person)], down.fetch, 1);
    expect(first.retryMessages).toEqual([{ msgId: 'm0', delaySeconds: 30 }]);
    const third = await consume([jobFor(person)], down.fetch, 3);
    expect(third.retryMessages).toEqual([{ msgId: 'm0', delaySeconds: 120 }]);

    const limited = fakeExpoPushService(() =>
      Response.json({ data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] }),
    );
    const again = await consume([jobFor(person)], limited.fetch, 2);
    expect(again.retryMessages).toEqual([{ msgId: 'm0', delaySeconds: 60 }]);
    expect(backoffSeconds(20)).toBe(900);
  });

  it('acks a push Expo refuses outright, and ledgers why', async () => {
    recordPushQueue();
    const { person } = await personWithPhone();
    const refused = fakeExpoPushService(() => new Response('bad', { status: 400 }));
    const result = await consume([jobFor(person)], refused.fetch);
    expect(result.explicitAcks).toEqual(['m0']);
    expect((await ledgerOf(person))[0]).toMatchObject({ decision: 'failed', reason: 'http_400' });
  });
});

describe('receipts', () => {
  const check = (person: string, ...tickets: string[]): ReceiptCheck => ({
    receipts: tickets.map((ticket) => ({ ticket, person, device: 'phone-1', token: TOKEN })),
  });

  it('records each receipt and drops the token of an unregistered device', async () => {
    recordPushQueue();
    const { person, cottage } = await personWithPhone();
    const expo = fakeExpoPushService(okTickets);
    await consume([jobFor(person)], expo.fetch);
    await consume([jobFor(person, { seq: 9, collapseKey: 'other' })], expo.fetch);
    // Both sends got ticket-0 from the fake; give the second its own id.
    await env.DB.prepare(
      "UPDATE push_ledger SET ticket_id = 'ticket-b' WHERE person_id = ? AND seq = 9",
    )
      .bind(person)
      .run();

    const receipts = fakeExpoPushService(() =>
      Response.json({
        data: {
          'ticket-0': { status: 'ok' },
          'ticket-b': { status: 'error', details: { error: 'DeviceNotRegistered' } },
        },
      }),
    );
    const result = await consume([check(person, 'ticket-0', 'ticket-b')], receipts.fetch);
    expect(receipts.calls[0]).toEqual({
      url: EXPO_RECEIPTS_URL,
      body: { ids: ['ticket-0', 'ticket-b'] },
    });
    expect(result.explicitAcks).toEqual(['m0']);
    const rows = await ledgerOf(person);
    expect(rows.map((r) => [r['ticket'], r['receipt']])).toEqual([
      ['ticket-0', 'ok'],
      ['ticket-b', 'DeviceNotRegistered'],
    ]);
    await expect(cottage.listDevices()).resolves.toEqual([
      expect.objectContaining({ pushToken: null }),
    ]);
  });

  it('asks again later for receipts not ready yet, then gives up', async () => {
    recordPushQueue();
    const { person } = await personWithPhone();
    const notYet = fakeExpoPushService(() => Response.json({ data: {} }));
    const early = await consume([check(person, 'ticket-x')], notYet.fetch, 1);
    expect(early.retryMessages).toEqual([{ msgId: 'm0', delaySeconds: 900 }]);
    const late = await consume([check(person, 'ticket-x')], notYet.fetch, 3);
    expect(late.explicitAcks).toEqual(['m0']);
  });

  it('acks a message it cannot read rather than retrying it forever', async () => {
    const expo = fakeExpoPushService(okTickets);
    const result = await consume([{ hello: 'world' }], expo.fetch);
    expect(result.explicitAcks).toEqual(['m0']);
    expect(expo.calls).toEqual([]);
  });
});

it('keeps a pushed job’s farm name as the title, and the app’s for a push with no farm', async () => {
  recordPushQueue();
  const person = freshPerson();
  const cottage = cottageOf(env, person);
  await cottage.updateSettings({ quietHours: { from: '00:00', to: '00:00', timeZone: 'UTC' } });
  await cottage.registerDevice('phone-1', {
    platform: 'android',
    name: 'Pixel',
    pushToken: TOKEN,
    appVersion: '1.0.0',
  });
  const expo = fakeExpoPushService(okTickets);
  await consume(
    [
      jobFor(person, {
        farm: null,
        kind: 'nudge_wave',
        seq: null,
        collapseKey: 'nudge.20261018',
        copy: { key: 'push.nudge.last', params: {} },
      }),
    ],
    expo.fetch,
  );
  expect((expo.calls[0]!.body as Record<string, unknown>[])[0]).toMatchObject({
    title: 'Kithfield',
    body: 'I’ll stop knocking. The farm will wait.',
    threadId: 'kithfield',
  });
});
