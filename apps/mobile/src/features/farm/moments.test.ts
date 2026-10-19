import { describe, expect, it } from '@jest/globals';

import { DAY, farmLog } from './farm-log.test-data';
import { momentFor, visitBefore, waveThenGo } from './moments';

describe('the moments a farm shows as it opens', () => {
  it('celebrates your own fresh move-in on a farm this phone has never opened', () => {
    const log = farmLog([['p_june', 'rabbit']]);
    const m = momentFor(log.state(), 'p_june', log.at + 60_000, {
      welcomed: null,
      joinsSeen: null,
    });
    expect(m).toMatchObject({ kind: 'moveIn', person: 'p_june' });
  });

  it('shows a neighbour moving in once, then nothing', () => {
    const log = farmLog([['p_june', 'rabbit']]);
    const before = log.state().members[0]?.joinedAt ?? 0;
    log.wait(DAY).add('joined', 'p_dot', {
      name: 'Dot',
      critter: {
        species: 'duck',
        coat: 'plain',
        mark: null,
        accessory: null,
        outfit: null,
        outfitColor: null,
        companion: null,
        cottage: null,
      },
      via: 'invite',
    });
    const state = log.state();
    const first = momentFor(state, 'p_june', log.at, { welcomed: null, joinsSeen: before });
    expect(first).toMatchObject({ kind: 'moveIn', person: 'p_dot' });
    const again = momentFor(state, 'p_june', log.at, {
      welcomed: null,
      joinsSeen: first.kind === 'moveIn' ? first.upTo : null,
    });
    expect(again.kind).toBe('none');
  });

  it('welcomes you back after a week away, once per absence', () => {
    const log = farmLog([
      ['p_june', 'rabbit'],
      ['p_bea', 'sheep'],
    ]);
    log.wait(60_000).add('farm_opened', 'p_june', {});
    const state = log.state();
    const opened = state.members.find((m) => m.person === 'p_june')?.lastOpenedAt ?? 0;
    const later = opened + 8 * DAY;
    expect(momentFor(state, 'p_june', later, { welcomed: null, joinsSeen: 0 })).toEqual({
      kind: 'welcome',
      since: opened,
    });
    expect(momentFor(state, 'p_june', later, { welcomed: opened, joinsSeen: 0 }).kind).not.toBe(
      'welcome',
    );
    expect(
      momentFor(state, 'p_june', opened + 6 * DAY, { welcomed: null, joinsSeen: 0 }).kind,
    ).not.toBe('welcome');
  });

  it('on a fresh install, welcomes back from the visit before this one, not this one', () => {
    const log = farmLog([
      ['p_june', 'rabbit'],
      ['p_bea', 'sheep'],
    ]);
    // The first snapshot already carries this visit's `farm_opened`.
    log.wait(30 * DAY).add('farm_opened', 'p_june', {});
    const state = log.state();
    const now = log.at + 60_000;
    const earlier = now - 9 * DAY;
    expect(
      momentFor(state, 'p_june', now, { welcomed: null, joinsSeen: 0, lastVisit: earlier }),
    ).toEqual({
      kind: 'welcome',
      since: earlier,
    });
    // Nothing known before this visit: no welcome rather than a wrong one.
    expect(
      momentFor(state, 'p_june', now, { welcomed: null, joinsSeen: 0, lastVisit: null }).kind,
    ).not.toBe('welcome');
  });

  it('finds the visit before this one in the farm’s log', () => {
    const opened = (actor: string, at: number) => ({ kind: 'farm_opened', actor, at });
    const events = [opened('p_june', 1000), opened('p_bea', 3000), opened('p_june', 9000)];
    expect(visitBefore(events, 'p_june', 5000)).toBe(1000);
    expect(visitBefore(events, 'p_june', 500)).toBeNull();
  });
});

describe('waving from a farm moment', () => {
  it('goes on to the chat once the wave is queued', async () => {
    const went: string[] = [];
    const sent = await waveThenGo(
      () => Promise.resolve(true),
      () => went.push('chat'),
    );
    expect(sent).toBe(true);
    expect(went).toEqual(['chat']);
  });

  it('stays on the moment when the wave is refused, so its reason can be read there', async () => {
    const went: string[] = [];
    const sent = await waveThenGo(
      () => Promise.resolve(false),
      () => went.push('chat'),
    );
    expect(sent).toBe(false);
    expect(went).toEqual([]);
  });
});
