import { describe, expect, it } from '@jest/globals';

import { DAY, farmLog } from './farm-log.test-data';
import { momentFor } from './moments';

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
});
