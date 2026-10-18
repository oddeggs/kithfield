import type { CottageDelivery, PushJob } from '@kithfield/contracts';
import { runDurableObjectAlarm } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import {
  cottageWithFarm,
  freshPerson,
  ledgerOf,
  NEVER_QUIET,
  quietNow,
  recordPushQueue,
} from './cottage-doubles';

const delivery = (over: Partial<CottageDelivery> & { farm: string; seq: number }) =>
  ({
    kind: 'joined',
    actor: 'otis',
    at: Date.now(),
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
    await cottage.muteFarm('farm-a', Date.now() + 3_600_000);
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

  it('holds a push through quiet hours and decides again when they end', async () => {
    const queue = recordPushQueue();
    const person = freshPerson();
    const cottage = await cottageWithFarm(person, 'farm-a');
    await cottage.updateSettings(quietNow());
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    expect(queue.jobs()).toEqual([]);
    expect((await ledgerOf(person))[0]).toMatchObject({ decision: 'held', reason: 'quiet_hours' });

    await cottage.updateSettings(NEVER_QUIET);
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
    await cottage.deliver(delivery({ farm: 'farm-a', seq: 2 }));
    expect(queue.jobs()).toHaveLength(1);
    expect(await ledgerOf(person)).toHaveLength(1);
  });
});

describe('the chat list and Quick Tend', () => {
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
    at: Date.now(),
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
