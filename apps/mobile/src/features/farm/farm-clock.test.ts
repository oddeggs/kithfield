import { describe, expect, it } from '@jest/globals';
import { motion } from '@kithfield/theme';

import { breathOf, isBlinking, tick } from './farm-clock';

const frame = motion.twos.frameMs / 1000;

describe('the farm’s clock', () => {
  it('moves on twos and only changes when a new drawing is due', () => {
    const a = tick(10, 0.01, 10);
    expect(a.changed).toBe(false);
    const b = tick(10, frame + 0.001, 10);
    expect(b.changed).toBe(true);
    expect(b.t / frame).toBeCloseTo(Math.round(b.t / frame), 6);
  });

  it('carries on from where it stopped when the farm shows again', () => {
    // Running from 1.2 s for 5 s, then hidden: the time it reached is where it starts again.
    const reached = tick(1.2, 5, 1.2).t;
    const resumed = tick(reached, 0, reached);
    expect(resumed.t).toBeCloseTo(reached, 6);
    expect(resumed.t).toBeGreaterThan(6);
  });

  it('breathes on the theme’s periods, slower asleep', () => {
    const awake = motion.breath.awakeMs / 1000;
    const asleep = motion.breath.asleepMs / 1000;
    expect(breathOf(0, 0, false)).toBeCloseTo(breathOf(awake, 0, false), 6);
    expect(breathOf(0, 0, true)).toBeCloseTo(breathOf(asleep, 0, true), 6);
    expect(Math.abs(breathOf(asleep / 4, 0, true))).toBeGreaterThan(
      Math.abs(breathOf(awake / 4, 0, false)),
    );
  });

  it('blinks briefly, as the renderer does', () => {
    const blinks = Array.from({ length: 120 }, (_, i) => isBlinking(i * frame, 0.37)).filter(
      Boolean,
    );
    expect(blinks.length).toBeGreaterThan(0);
    expect(blinks.length).toBeLessThan(10);
  });
});
