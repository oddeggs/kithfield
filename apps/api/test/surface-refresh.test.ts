import type { CottageDelivery } from '@kithfield/contracts';
import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { cottageClock } from '../src/cottage/clock';
import { planRefresh, REFRESH_GAP_MS } from '../src/cottage/surface-refresh';
import { consumePush } from '../src/push/consumer';
import { EXPO_SEND_URL } from '../src/push/expo';
import {
  cottageWithFarm,
  fakeExpoPushService,
  freshPerson,
  ledgerOf,
  MIDDAY,
  okTickets,
  recordPushQueue,
  useTestClock,
} from './cottage-doubles';

let start = 0;
beforeEach(() => {
  start = useTestClock(MIDDAY);
});

const fire = (seq: number, over: Partial<CottageDelivery> = {}): CottageDelivery => ({
  farm: 'farm-a',
  seq,
  kind: 'fire',
  actor: 'otis',
  at: cottageClock.now(),
  preview: null,
  forYou: false,
  connected: false,
  ...over,
});

describe('spacing out widget refreshes', () => {
  it('sends at once, then once at the end of the gap, then nothing more until it has gone', () => {
    expect(planRefresh(null, 0)).toEqual({ action: 'send' });
    expect(planRefresh(0, 60_000)).toEqual({ action: 'later', delayMs: REFRESH_GAP_MS - 60_000 });
    expect(planRefresh(REFRESH_GAP_MS, 120_000)).toEqual({ action: 'none' });
    expect(planRefresh(0, REFRESH_GAP_MS)).toEqual({ action: 'send' });
  });
});

describe('the fire tells the widgets', () => {
  it('queues a silent refresh for a fire lit by someone else, even with the farm open', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(fire(2, { connected: true }));
    expect(queue.sent).toEqual([
      {
        body: {
          surfaceRefresh: { person, farm: 'farm-a', reason: 'fire', refresh: 'widgets' },
        },
        delaySeconds: undefined,
      },
    ]);
    // Not an alert: nothing in the budget's ledger.
    expect(await ledgerOf(person)).toEqual([]);
  });

  it('leaves the person’s own fire alone: their app redraws itself', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(fire(2, { actor: person }));
    expect(queue.sent).toEqual([]);
  });

  it('folds changes inside the gap into one refresh at its end, so the fire going out arrives', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(fire(2));
    useTestClock(new Date(start + 60_000).toISOString());
    await cottage.deliver(fire(3));
    await cottage.deliver(fire(4));
    // The clock runs on in real time, so the delay is read to the nearest few seconds.
    const delays = () =>
      queue.sent.map((s) => (s.delaySeconds ?? 0) - ((s.delaySeconds ?? 0) % 10));
    expect(queue.sent).toHaveLength(2);
    expect(delays()).toEqual([0, 240]);
    useTestClock(new Date(start + REFRESH_GAP_MS + 1000).toISOString());
    await cottage.deliver(fire(5));
    expect(queue.sent).toHaveLength(3);
    expect(delays()[2]).toBeGreaterThan(230);
  });

  it('refreshes the knocked person’s widget', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(fire(2, { kind: 'knock', forYou: true }));
    const refreshes = queue.sent.filter((s) => 'surfaceRefresh' in s.body);
    expect(refreshes.map((s) => s.body)).toEqual([
      { surfaceRefresh: { person, farm: 'farm-a', reason: 'knock', refresh: 'widgets' } },
    ]);
  });
});

describe('the consumer sends widget refreshes silently', () => {
  it('sends content-available with no alert, sound or badge, and ledgers nothing', async () => {
    recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.registerDevice('phone-1', {
      platform: 'ios',
      name: 'June’s iPhone',
      pushToken: 'ExponentPushToken[june]',
      appVersion: '1.0.0 (1)',
    });
    const expo = fakeExpoPushService(okTickets);
    const batch = createMessageBatch('kithfield-push-dev', [
      {
        id: 'm0',
        timestamp: new Date(),
        attempts: 1,
        body: { surfaceRefresh: { person, farm: 'farm-a', reason: 'fire', refresh: 'widgets' } },
      },
    ]);
    const ctx = createExecutionContext();
    await consumePush(batch, env, ctx, { fetch: expo.fetch, now: () => cottageClock.now() });
    const result = (await getQueueResult(batch, ctx)) as unknown as { explicitAcks: string[] };
    expect(result.explicitAcks).toEqual(['m0']);
    expect(expo.calls).toEqual([
      {
        url: EXPO_SEND_URL,
        body: [
          {
            to: 'ExponentPushToken[june]',
            data: { refresh: 'widgets', farm: 'farm-a', reason: 'fire' },
            _contentAvailable: true,
            priority: 'normal',
            collapseId: 'refresh.fire.farm-a',
            ttl: 3600,
          },
        ],
      },
    ]);
    expect(await ledgerOf(person)).toEqual([]);
  });

  it('sends nothing to a hibernating person', async () => {
    recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.registerDevice('phone-1', {
      platform: 'ios',
      name: 'iPhone',
      pushToken: 'ExponentPushToken[x]',
      appVersion: '1.0.0 (1)',
    });
    await cottage.setHibernating(true);
    const expo = fakeExpoPushService(okTickets);
    const batch = createMessageBatch('kithfield-push-dev', [
      {
        id: 'm0',
        timestamp: new Date(),
        attempts: 1,
        body: { surfaceRefresh: { person, farm: 'farm-a', reason: 'fire', refresh: 'widgets' } },
      },
    ]);
    const ctx = createExecutionContext();
    await consumePush(batch, env, ctx, { fetch: expo.fetch, now: () => cottageClock.now() });
    expect(expo.calls).toEqual([]);
  });
});
