import { describe, expect, it } from '@jest/globals';

import { drawnFacing, mirrorFor } from './sprite';

describe('which way a travelling critter faces', () => {
  it('faces the way the art draws it standing: the hedgehog and sheep to the left', () => {
    expect(drawnFacing('hedgehog')).toBe('left');
    expect(drawnFacing('sheep')).toBe('left');
    expect(drawnFacing('rabbit')).toBe('right');
  });

  it('is mirrored only when it should face the other way from how it is drawn', () => {
    expect(mirrorFor('hedgehog', 'right')).toBe(true);
    expect(mirrorFor('hedgehog', 'left')).toBe(false);
    expect(mirrorFor('fox', 'left')).toBe(true);
    expect(mirrorFor('fox', undefined)).toBe(false);
  });
});
