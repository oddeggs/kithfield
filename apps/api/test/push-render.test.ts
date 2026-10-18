import type { PushJob } from '@kithfield/contracts';
import { describe, expect, it } from 'vitest';

import { tag } from '../src/push/catalogue';
import { expoMessage, notificationCategoryOf, planSeedOf } from '../src/push/render';

const job = (over: Partial<PushJob> = {}): PushJob => ({
  person: 'june',
  farm: 'farm-a',
  kind: 'message',
  seq: 12,
  collapseKey: 'mention.abc.12',
  copy: { key: 'push.mention', params: { name: 'Otis' } },
  forYou: true,
  at: 0,
  ...over,
});

const rendered = { title: 'The Thursday Lot', body: 'Hello', passive: false };

describe('push categories', () => {
  it('asks for an answer on a plan that sprouted, naming its planting', () => {
    const plan = job({ kind: 'seed_planted', seq: 30, copy: { key: 'push.plan.new', params: {} } });
    expect(notificationCategoryOf(plan)).toBe('plan');
    const message = expoMessage(plan, rendered, 'ExponentPushToken[x]', 'push-1');
    expect(message.categoryId).toBe('plan');
    expect(message.data).toEqual({
      farm: 'farm-a',
      seq: 30,
      kind: 'seed_planted',
      push: 'push-1',
      seed: 30,
    });
  });

  it('reads the planting from a plan push another producer made', () => {
    const reminder = job({
      kind: 'rsvp',
      seq: 41,
      copy: { key: 'push.plan.needsYou', params: { seed: '30' } },
    });
    expect(planSeedOf(reminder)).toBe(30);
    expect(notificationCategoryOf(reminder)).toBe('plan');
    expect(planSeedOf(job({ copy: { key: 'push.plan.x', params: { seed: 'x' } } }))).toBeNull();
  });

  it('lets a dewdrop answer a mention or the doorstep', () => {
    expect(notificationCategoryOf(job())).toBe('tend');
    const gift = job({ kind: 'gift', copy: { key: 'push.doorstep.gift', params: {} } });
    expect(notificationCategoryOf(gift)).toBe('tend');
    const message = expoMessage(job(), rendered, 't', 'p');
    expect(message.data).not.toHaveProperty('seed');
    expect(message.mutableContent).toBe(true);
  });

  it('offers nothing on knocks, nudges, reminders and the quiet "a few things"', () => {
    expect(
      notificationCategoryOf(job({ kind: 'knock', copy: { key: 'push.knock', params: {} } })),
    ).toBeNull();
    expect(notificationCategoryOf(job({ copy: { key: 'push.farm.few', params: {} } }))).toBeNull();
    const nudge = job({ farm: null, kind: 'nudge_back', copy: { key: 'push.nudge', params: {} } });
    expect(notificationCategoryOf(nudge)).toBeNull();
    const message = expoMessage(nudge, rendered, 't', 'p');
    expect(message).not.toHaveProperty('categoryId');
    expect(message).not.toHaveProperty('mutableContent');
    expect(message).not.toHaveProperty('badge');
  });
});

describe('critter still names', () => {
  it('names a person’s still the way the app writes it', () => {
    // The app names each critter still `critter-<tag>.png`; both sides test this vector.
    expect(tag('person-1')).toBe('5v9g1o0ndk');
  });
});
