import { describe, expect, it } from '@jest/globals';

import { surfaceLink, targetOf } from './links';

describe('surface links', () => {
  it('round-trip each target through its link', () => {
    const link = surfaceLink('kithfield-dev', { to: 'critter', farm: 'f_lot', person: 'p_pip' });
    expect(link).toBe('kithfield-dev://surfaces/open?to=critter&farm=f_lot&person=p_pip');
    expect(targetOf({ to: 'plan', farm: 'f_lot', seed: '20' })).toEqual({
      to: 'plan',
      farm: 'f_lot',
      seed: 20,
    });
  });

  it('refuse a farm or person that isn’t an id', () => {
    expect(targetOf({ to: 'farm', farm: '../../etc' })).toBeNull();
    expect(targetOf({ to: 'critter', farm: 'f_lot', person: 'p pip' })).toBeNull();
    expect(targetOf({ to: 'plan', farm: 'f_lot', seed: '-3' })).toBeNull();
  });
});
