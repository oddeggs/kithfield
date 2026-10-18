import { describe, expect, it } from '@jest/globals';
import type { FarmState } from '@kithfield/contracts';

import { removalFor, shownAfter, wasShown } from './removal';

const critter = {
  species: 'badger',
  coat: 'cocoa',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
} as const;

const farm = (former: FarmState['former'], members: string[] = []) =>
  ({
    farm: 'f1',
    name: 'The Thursday Lot',
    members: members.map((person) => ({ person })),
    former,
  }) as unknown as FarmState;

const gone = (how: 'left' | 'removed' | 'account_deleted') => ({
  person: 'bram',
  name: 'Bram',
  critter,
  joinedAt: 1,
  leftAt: 50,
  how,
});

const removedEvent = (by: 'keeper' | 'safety', seq = 9) => ({
  seq,
  kind: 'removed',
  payload: { person: 'bram', removeMedia: false, by },
});

describe('the removal notice', () => {
  it('shows for a removal the phone holds, saying only whether a keeper or the safety team', () => {
    expect(removalFor(farm([gone('removed')]), 'bram', [removedEvent('safety')])).toEqual({
      farmName: 'The Thursday Lot',
      by: 'safety',
      key: 'f1:9:bram',
    });
  });

  it('refuses a crafted link for a farm the person was never removed from', () => {
    expect(removalFor(farm([], ['bram']), 'bram', [])).toBeNull();
    expect(removalFor(farm([gone('left')]), 'bram', [])).toBeNull();
    expect(removalFor(null, 'bram', [removedEvent('keeper')])).toBeNull();
    expect(removalFor(farm([gone('removed')]), 'june', [removedEvent('keeper')])).toBeNull();
  });

  it('takes the newest removal, keyed by its seq', () => {
    const notice = removalFor(farm([gone('removed')]), 'bram', [
      removedEvent('safety', 4),
      removedEvent('keeper', 12),
    ]);
    expect(notice).toMatchObject({ by: 'keeper', key: 'f1:12:bram' });
  });

  it('remembers each removal it showed, once', () => {
    const list = shownAfter(shownAfter(null, 'f1:9:bram'), 'f1:9:bram');
    expect(JSON.parse(list)).toEqual(['f1:9:bram']);
    expect(wasShown(list, 'f1:9:bram')).toBe(true);
    expect(wasShown(list, 'f1:12:bram')).toBe(false);
    expect(wasShown('not json', 'f1:9:bram')).toBe(false);
  });
});
