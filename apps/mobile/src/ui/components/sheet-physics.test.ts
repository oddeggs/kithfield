import { describe, expect, it } from '@jest/globals';

import { rubberBand, settleIndex, shouldDismiss } from './sheet-physics';

const detents = [200, 420, 700];

describe('sheet stops', () => {
  it('settles at the nearest stop when let go slowly', () => {
    expect(settleIndex(detents, 260, 0)).toBe(0);
    expect(settleIndex(detents, 330, 0)).toBe(1);
    expect(settleIndex(detents, 650, 0)).toBe(2);
  });

  it('carries a flick on to the next stop', () => {
    expect(settleIndex(detents, 260, 1200)).toBe(1);
    expect(settleIndex(detents, 450, -1500)).toBe(0);
  });

  it('closes a modal sheet pulled well below its lowest stop or flung down', () => {
    expect(shouldDismiss(detents, 210, -2000)).toBe(false);
    expect(shouldDismiss(detents, 180, 0)).toBe(false);
    expect(shouldDismiss(detents, 90, 0)).toBe(true);
    expect(shouldDismiss(detents, 180, -1200)).toBe(true);
  });

  it('follows the finger at a third past the highest stop', () => {
    expect(rubberBand(detents, 500)).toBe(500);
    expect(rubberBand(detents, 790)).toBe(730);
    expect(rubberBand(detents, -20)).toBe(0);
  });
});
