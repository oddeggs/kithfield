import type { CottageDelivery, PushJob } from '@kithfield/contracts';
import { runDurableObjectAlarm } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { cottageClock } from '../src/cottage/clock';
import { pushQueue } from '../src/push/queue';
import {
  cottageWithFarm,
  freshPerson,
  ledgerOf,
  MIDDAY,
  recordPushQueue,
  seedDirectory,
  useTestClock,
} from './cottage-doubles';

beforeEach(() => {
  useTestClock(MIDDAY);
});

const delivery = (over: Partial<CottageDelivery> & { farm: string; seq: number }) =>
  ({
    kind: 'joined',
    actor: 'otis',
    at: cottageClock.now(),
    preview: null,
    forYou: false,
    connected: false,
    ...over,
  }) satisfies CottageDelivery;

describe('the cottage decides on pushes', () => {
  it('queues a push for an event meant for the person, with its copy key and no rendered text', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(
      delivery({ farm: 'farm-a', seq: 2, kind: 'message', preview: 'chairs?', forYou: true }),
    );
    expect(queue.jobs()).toEqual([
      expect.objectContaining({
        person,
        farm: 'farm-a',
        kind: 'message',
        seq: 2,
        copy: { key: 'push.mention', params: { preview: 'chairs?' } },
      }),
    ]);
    expect(await ledgerOf(person)).toEqual([
      expect.objectContaining({ kind: 'message', decision: 'queued', farm: 'farm-a', seq: 2 }),
    ]);
  });

  it('skips a muted farm', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.muteFarm('farm-a', cottageClock.now() + 3_600_000);
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    expect(queue.jobs()).toEqual([]);
    expect(await ledgerOf(person)).toEqual([
      expect.objectContaining({ decision: 'skipped', reason: 'muted' }),
    ]);
  });

  it('skips a hibernating person', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.setHibernating(true);
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    expect(queue.jobs()).toEqual([]);
    expect((await ledgerOf(person))[0]).toMatchObject({
      decision: 'skipped',
      reason: 'hibernating',
    });
  });

  it('skips a person who has the farm open', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2, connected: true }));
    expect(queue.jobs()).toEqual([]);
    expect((await ledgerOf(person))[0]).toMatchObject({ decision: 'skipped', reason: 'connected' });
  });

  it('holds a push through the house floor in the person’s zone, and sends it when it ends', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    // 23:00 UTC is 06:00 in Hanoi: still before 8am there.
    await cottage.updateSettings({}, 'Asia/Ho_Chi_Minh');
    useTestClock('2026-10-18T23:00:00Z');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    expect(queue.jobs()).toEqual([]);
    expect((await ledgerOf(person))[0]).toMatchObject({ decision: 'held', reason: 'quiet_hours' });

    // 00:30 UTC is 07:30 there: the alarm finds it still quiet and waits.
    useTestClock('2026-10-19T00:30:00Z');
    expect(await runDurableObjectAlarm(cottage)).toBe(true);
    expect(queue.jobs()).toEqual([]);

    useTestClock('2026-10-19T01:00:00Z');
    expect(await runDurableObjectAlarm(cottage)).toBe(true);
    expect(queue.jobs().map((j) => j.copy.key)).toEqual(['push.joined']);
    expect((await ledgerOf(person)).map((r) => r['decision'])).toEqual(['held', 'queued']);
  });

  it('collapses a farm over its budget into one "a few things" push, then folds the rest', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    for (const seq of [2, 3, 4]) await cottage.deliver(delivery({ farm: 'farm-a', seq }));
    const jobs = queue.jobs();
    expect(jobs.map((j) => j.copy.key)).toEqual(['push.joined', 'push.farm.few']);
    expect(jobs[1]!.collapseKey).toBe(jobs[0]!.collapseKey);
    expect(await ledgerOf(person)).toEqual([
      expect.objectContaining({ seq: 2, decision: 'queued', collapsed: 0 }),
      expect.objectContaining({ seq: 3, decision: 'queued', reason: 'budget', collapsed: 1 }),
      expect.objectContaining({ seq: 4, decision: 'collapsed', reason: 'budget' }),
    ]);
  });

  it('bundles the doorstep: after the first, "a few things are on your step"', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.upsertFarm({ farm: 'farm-b', farmKind: 'farm', name: 'Allotment', with: null });
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2, kind: 'firefly', forYou: true }));
    await cottage.deliver(delivery({ farm: 'farm-b', seq: 5, kind: 'gift', forYou: true }));
    const jobs = queue.jobs();
    expect(jobs.map((j) => j.copy.key)).toEqual(['push.doorstep.firefly', 'push.doorstep.few']);
    expect(jobs[1]!.collapseKey).toBe(jobs[0]!.collapseKey);
  });

  it('ignores a delivery it already holds', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 3 }));
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 3 }));
    expect(queue.jobs()).toHaveLength(1);
    expect(await ledgerOf(person)).toHaveLength(1);
  });
});

describe('quiet hours always hold', () => {
  it('holds at night in a zone the app sent, even with no quiet hours of their own', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    expect((await cottage.settings()).settings.quietHours).toBeNull();
    // Midday UTC is 1am in Auckland.
    await cottage.updateSettings({}, 'Pacific/Auckland');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    expect(queue.jobs()).toEqual([]);
    expect((await ledgerOf(person))[0]).toMatchObject({ decision: 'held' });
  });

  it('never holds a knock: in quiet hours it expires', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    useTestClock('2026-10-18T23:00:00Z');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2, kind: 'knock', forYou: true }));
    expect((await ledgerOf(person))[0]).toMatchObject({ decision: 'skipped', reason: 'expired' });
    useTestClock('2026-10-19T09:00:00Z');
    await runDurableObjectAlarm(cottage);
    expect(queue.jobs()).toEqual([]);
  });

  it('drops a held push when the person leaves the farm', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    useTestClock('2026-10-18T23:00:00Z');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    await cottage.leaveFarm('farm-a');
    useTestClock('2026-10-19T09:00:00Z');
    await runDurableObjectAlarm(cottage);
    expect(queue.jobs()).toEqual([]);
  });

  it('keeps a held push when queueing it fails, and sends it on the next ring', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    useTestClock('2026-10-18T23:00:00Z');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    useTestClock('2026-10-19T09:00:00Z');
    const working = pushQueue.send;
    let failures = 1;
    pushQueue.send = (...args) =>
      failures-- > 0 ? Promise.reject(new Error('queue down')) : working(...args);
    expect(await runDurableObjectAlarm(cottage)).toBe(true);
    expect(queue.jobs()).toEqual([]);
    expect(await runDurableObjectAlarm(cottage)).toBe(true);
    expect(queue.jobs().map((j) => j.copy.key)).toEqual(['push.joined']);
  });

  it('holds a push the queue refused and tries it again, spending no budget on the failure', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    const working = pushQueue.send;
    pushQueue.send = () => Promise.reject(new Error('queue down'));
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    expect((await ledgerOf(person))[0]).toMatchObject({ decision: 'held', reason: 'queue_failed' });
    pushQueue.send = working;
    expect(await runDurableObjectAlarm(cottage)).toBe(true);
    // Sent as itself, not as "a few things": the failed try spent nothing.
    expect(queue.jobs().map((j) => j.copy.key)).toEqual(['push.joined']);
  });
});

describe('the chat list and Quick Tend', () => {
  it('takes a late delivery (a slow post) even after a newer event', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 5, kind: 'message', preview: 'hi' }));
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 3, kind: 'slow_post', forYou: true }));
    expect(queue.jobs().map((j) => [j.seq, j.copy.key])).toEqual([[3, 'push.doorstep.slowPost']]);
    expect((await cottage.waiting()).map((w) => w.seq)).toEqual([3]);
    expect((await cottage.chatList())[0]).toMatchObject({ seq: 5, kind: 'message', waiting: 1 });
  });

  it('finds a farm it was never told about in D1, so its chat still shows', async () => {
    recordPushQueue();
    const person = freshPerson();
    const farm = `dir-${person}`;
    const visit = `dir-visit-${person}`;
    const peer = `peer-${person}`;
    const critter = {
      species: 'fox',
      coat: 'red',
      mark: null,
      accessory: null,
      outfit: null,
      outfitColor: null,
      companion: null,
      cottage: null,
    };
    await seedDirectory({
      farms: [
        { id: farm, kind: 'farm', name: 'Allotment', pair: null },
        { id: visit, kind: 'visit', name: null, pair: [person, peer].sort().join(':') },
      ],
      people: [{ id: peer, displayName: 'Pip', critter }],
    });
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(delivery({ farm, seq: 2 }));
    await cottage.deliver(delivery({ farm: visit, seq: 2, actor: peer }));
    const list = await cottage.chatList();
    expect(list.find((c) => c.farm === farm)).toMatchObject({
      farmKind: 'farm',
      name: 'Allotment',
    });
    expect(list.find((c) => c.farm === visit)).toMatchObject({
      farmKind: 'visit',
      name: null,
      with: { person: peer, name: 'Pip', critter },
    });
  });

  it('names a visit’s peer in its pushes and keeps what waits until the farm is opened', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    const critter = {
      species: 'otter',
      coat: 'brown',
      mark: null,
      accessory: null,
      outfit: null,
      outfitColor: null,
      companion: null,
      cottage: null,
    } as const;
    await cottage.upsertFarm({
      farm: 'visit-1',
      farmKind: 'visit',
      name: null,
      with: { person: 'otis', name: 'Otis', critter },
    });
    await cottage.deliver(delivery({ farm: 'visit-1', seq: 2, kind: 'firefly', forYou: true }));
    expect(queue.jobs()[0]!.copy.params).toEqual({ name: 'Otis' });
    expect(await cottage.waiting()).toEqual([
      { farm: 'visit-1', seq: 2, kind: 'firefly', actor: 'otis', at: expect.any(Number) as number },
    ]);
    expect((await cottage.chatList()).find((c) => c.farm === 'visit-1')).toMatchObject({
      farmKind: 'visit',
      name: null,
      with: { person: 'otis', name: 'Otis' },
      waiting: 1,
    });

    await cottage.deliver(
      delivery({ farm: 'visit-1', seq: 3, kind: 'farm_opened', actor: person }),
    );
    expect(await cottage.waiting()).toEqual([]);
  });

  it('keeps a farm off the list until it knows the farm, and pinned farms first', async () => {
    recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2, at: 1 }));
    await cottage.deliver(delivery({ farm: 'farm-z', seq: 2, at: 2 }));
    expect((await cottage.chatList()).map((c) => c.farm)).toEqual(['farm-a']);
    await cottage.upsertFarm({ farm: 'farm-z', farmKind: 'farm', name: 'Zed', with: null });
    expect((await cottage.chatList()).map((c) => c.farm)).toEqual(['farm-z', 'farm-a']);
    await cottage.pinFarm('farm-a', true);
    expect((await cottage.chatList()).map((c) => [c.farm, c.pinned])).toEqual([
      ['farm-a', true],
      ['farm-z', false],
    ]);
  });
});

describe('nudges back off', () => {
  const nudge = (person: string): PushJob => ({
    person,
    farm: null,
    kind: 'nudge_wave',
    seq: null,
    collapseKey: 'nudge.wave',
    copy: { key: 'push.nudge.wave', params: { name: 'Otis' } },
    forYou: true,
    at: cottageClock.now(),
  });

  it('after two are ignored, sends the last one, then rests until the person comes back', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.updateSettings({ nudges: 'some' });
    const outcomes = [];
    for (let i = 0; i < 4; i += 1) outcomes.push(await cottage.push(nudge(person)));
    expect(outcomes).toEqual(['send', 'send', 'send', 'skip']);
    expect(queue.jobs().map((j) => j.copy.key)).toEqual([
      'push.nudge.wave',
      'push.nudge.wave',
      'push.nudge.last',
    ]);
    expect((await ledgerOf(person))[3]).toMatchObject({
      decision: 'skipped',
      reason: 'backed_off',
    });

    // Opening a farm on their own brings nudges back.
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2, kind: 'farm_opened', actor: person }));
    expect(await cottage.push(nudge(person))).toBe('send');
    expect(queue.jobs().at(-1)!.copy.key).toBe('push.nudge.wave');
  });

  it('sends none when the person turned nudges off', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.updateSettings({ nudges: 'off' });
    expect(await cottage.push(nudge(person))).toBe('skip');
    expect(queue.jobs()).toEqual([]);
    expect((await ledgerOf(person))[0]).toMatchObject({ reason: 'nudges_off' });
  });
});
