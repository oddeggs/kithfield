import { describe, expect, it } from 'vitest';

import { budgetKey, candidateFor, collapseKeyFor, tag } from '../src/push/catalogue';
import {
  type DecideInput,
  decide,
  holdUntil,
  localClock,
  quietEndsAt,
  quietWindows,
} from '../src/push/policy';

// 2026-10-18 12:00 UTC.
const NOON = Date.UTC(2026, 9, 18, 12, 0);

const base: DecideInput = {
  category: 'farm',
  at: NOON,
  muted: false,
  hibernating: false,
  connected: false,
  quiet: quietWindows(null, 'UTC'),
  nudges: 'some',
  backOffWhenQuiet: true,
  nudgesSinceBack: 0,
  nudgesThisWeek: 0,
  sentToday: 0,
  fewSent: false,
};

describe('decide', () => {
  it('skips a muted farm, a hibernating person and an open farm, in that order of reasons', () => {
    expect(decide({ ...base, hibernating: true, muted: true, connected: true })).toEqual({
      action: 'skip',
      reason: 'hibernating',
    });
    expect(decide({ ...base, muted: true, connected: true })).toEqual({
      action: 'skip',
      reason: 'muted',
    });
    expect(decide({ ...base, connected: true })).toEqual({ action: 'skip', reason: 'connected' });
  });

  it('holds a push in quiet hours until they end, before any budget is spent', () => {
    const quiet = quietWindows({ from: '11:00', to: '13:30', timeZone: 'UTC' }, 'UTC');
    expect(decide({ ...base, quiet, sentToday: 5 })).toEqual({
      action: 'hold',
      until: Date.UTC(2026, 9, 18, 13, 30),
    });
  });

  it('sends the first push of the day for a farm, then collapses once, then folds', () => {
    expect(decide(base)).toEqual({ action: 'send', last: false });
    expect(decide({ ...base, sentToday: 1 })).toEqual({ action: 'collapse' });
    expect(decide({ ...base, sentToday: 2, fewSent: true })).toEqual({ action: 'fold' });
  });

  it('allows three mentions a farm a day and one doorstep push a day', () => {
    expect(decide({ ...base, category: 'mention', sentToday: 2 }).action).toBe('send');
    expect(decide({ ...base, category: 'mention', sentToday: 3 }).action).toBe('collapse');
    expect(decide({ ...base, category: 'doorstep', sentToday: 1 }).action).toBe('collapse');
  });

  it('backs nudges off: two gentle ones, then the last, then quiet until they come back', () => {
    const nudge = { ...base, category: 'nudge' as const };
    expect(decide({ ...nudge, nudgesSinceBack: 0 })).toEqual({ action: 'send', last: false });
    expect(decide({ ...nudge, nudgesSinceBack: 1 })).toEqual({ action: 'send', last: false });
    expect(decide({ ...nudge, nudgesSinceBack: 2 })).toEqual({ action: 'send', last: true });
    expect(decide({ ...nudge, nudgesSinceBack: 3 })).toEqual({
      action: 'skip',
      reason: 'backed_off',
    });
  });

  it('keeps nudging without back-off when the person turned it off, within the weekly few', () => {
    const nudge = { ...base, category: 'nudge' as const, backOffWhenQuiet: false };
    expect(decide({ ...nudge, nudgesSinceBack: 9 })).toEqual({ action: 'send', last: false });
    expect(decide({ ...nudge, nudges: 'few', nudgesThisWeek: 2 })).toEqual({
      action: 'skip',
      reason: 'nudge_budget',
    });
    expect(decide({ ...nudge, nudges: 'off' })).toEqual({ action: 'skip', reason: 'nudges_off' });
  });

  it('sends a remember-me nudge on a muted farm, but never to a hibernating person', () => {
    const reminder = { ...base, category: 'reminder' as const };
    expect(decide({ ...reminder, muted: true, sentToday: 9 })).toEqual({
      action: 'send',
      last: false,
    });
    expect(decide({ ...reminder, hibernating: true }).action).toBe('skip');
  });
});

describe('knocks', () => {
  const knock = { ...base, category: 'knock' as const };

  it('never holds a knock: in quiet hours it expires, with no missed-call push later', () => {
    const late = Date.UTC(2026, 9, 18, 23, 0);
    expect(decide({ ...knock, at: late })).toEqual({ action: 'skip', reason: 'expired' });
    expect(decide(knock)).toEqual({ action: 'send', last: false });
  });

  it('lets one knock an hour through per porch, and never collapses the rest', () => {
    expect(decide({ ...knock, sentToday: 1 })).toEqual({ action: 'skip', reason: 'budget' });
  });
});

describe('quiet hours', () => {
  it('always keeps the house floor, 10pm to 8am in the person’s zone, with their own hours', () => {
    const own = { from: '07:00', to: '09:30', timeZone: 'UTC' };
    // 23:00 UTC: inside the floor, which ends at 08:00, inside their own hours until 09:30.
    expect(holdUntil(Date.UTC(2026, 9, 18, 23, 0), quietWindows(own, 'UTC'))).toBe(
      Date.UTC(2026, 9, 19, 9, 30),
    );
    // Their own hours never lift the floor.
    const daytime = { from: '13:00', to: '14:00', timeZone: 'UTC' };
    expect(holdUntil(Date.UTC(2026, 9, 18, 23, 0), quietWindows(daytime, 'UTC'))).toBe(
      Date.UTC(2026, 9, 19, 8, 0),
    );
    expect(holdUntil(NOON, quietWindows(null, 'UTC'))).toBeNull();
  });

  it('ends on the local hour across a clock change', () => {
    // London leaves summer time at 02:00 on 25 October 2026: 8am is 08:00 UTC again.
    const floor = { from: '22:00', to: '08:00', timeZone: 'Europe/London' };
    expect(quietEndsAt(Date.UTC(2026, 9, 24, 23, 0), floor)).toBe(Date.UTC(2026, 9, 25, 8, 0));
  });

  it('wraps midnight in the person’s zone and ends at their morning', () => {
    const quiet = { from: '22:00', to: '08:00', timeZone: 'Asia/Ho_Chi_Minh' };
    // 16:00 UTC is 23:00 in Hanoi: quiet until 08:00 there, 01:00 UTC.
    const lateEvening = Date.UTC(2026, 9, 18, 16, 0);
    expect(quietEndsAt(lateEvening, quiet)).toBe(Date.UTC(2026, 9, 19, 1, 0));
    expect(quietEndsAt(NOON, quiet)).toBeNull();
  });

  it('keeps the house floor in the person’s zone when they have no hours of their own', () => {
    expect(quietWindows(null, 'Europe/London')).toEqual([
      { from: '22:00', to: '08:00', timeZone: 'Europe/London' },
    ]);
  });

  it('reads an unknown zone as UTC', () => {
    expect(localClock(NOON, 'Nowhere/Atall')).toEqual({ date: '2026-10-18', minutes: 720 });
  });
});

describe('which events push', () => {
  const delivery = {
    farm: 'farm-1',
    seq: 7,
    kind: 'firefly',
    actor: 'otis',
    at: NOON,
    preview: null,
    forYou: true,
    connected: false,
  };

  it('pushes what is meant for the person, and never their own events', () => {
    expect(candidateFor({ ...delivery, kind: 'hug' }, 'june')).toBeNull();
    expect(candidateFor({ ...delivery, kind: 'knock' }, 'june')?.category).toBe('knock');
    expect(candidateFor(delivery, 'june')?.copyKey).toBe('push.doorstep.firefly');
    expect(candidateFor({ ...delivery, actor: 'june' }, 'june')).toBeNull();
    expect(candidateFor({ ...delivery, forYou: false }, 'june')).toBeNull();
    expect(candidateFor({ ...delivery, kind: 'message', preview: 'hi' }, 'june')?.category).toBe(
      'mention',
    );
    expect(candidateFor({ ...delivery, kind: 'joined', forYou: false }, 'june')?.copyKey).toBe(
      'push.joined',
    );
  });

  it('keeps every key within the queue’s 64 characters, even for the longest ids', () => {
    const farm = 'f'.repeat(64);
    for (const key of [
      budgetKey('mention', farm, '2026-10-18'),
      collapseKeyFor('mention', farm, '2026-10-18', 2 ** 40),
      collapseKeyFor('farm', farm, '2026-10-18', 1),
    ]) {
      expect(key).toMatch(/^[A-Za-z0-9_:.-]{1,64}$/);
    }
    expect(tag(farm)).toBe(tag(farm));
    expect(tag(farm)).not.toBe(tag('farm-2'));
  });
});
