import { describe, expect, it } from '@jest/globals';
import { motion } from '@kithfield/theme';

import { createSplashHandoff, SPLASH_MAX_HOLD_MS, splashFadeMs } from './splash-handoff';

/** A handoff whose hides are counted and whose one timer the test fires. */
function setup() {
  const hides: number[] = [];
  let timer: { fn: () => void; ms: number } | null = null;
  const handoff = createSplashHandoff({
    hide: () => hides.push(hides.length + 1),
    setTimer: (fn, ms) => {
      timer = { fn, ms };
      return () => {
        timer = null;
      };
    },
  });
  return { handoff, hides, timer: () => timer };
}

describe('the launch screen handing off to the app', () => {
  it('cross-fades as the warm start does, and as Reduce Motion does with it on', () => {
    expect(splashFadeMs(false)).toBe(motion.cross.durationMs);
    expect(splashFadeMs(true)).toBe(motion.fade.durationMs);
  });

  it('goes once the shell is laid out, when no screen draws in by itself', () => {
    const { handoff, hides } = setup();
    expect(hides).toEqual([]);
    handoff.ready();
    expect(hides).toEqual([1]);
    handoff.ready();
    expect(hides).toEqual([1]);
  });

  it('waits for the farm to draw its first frame', () => {
    const { handoff, hides } = setup();
    const valley = handoff.hold();
    handoff.ready();
    // The farm takes over before the valley lets go: nothing in between hides the splash.
    const farm = handoff.hold();
    valley();
    expect(hides).toEqual([]);
    farm();
    farm();
    expect(hides).toEqual([1]);
    expect(handoff.hidden).toBe(true);
  });

  it('is not held by a screen that comes after it went', () => {
    const { handoff, hides } = setup();
    handoff.ready();
    const late = handoff.hold();
    late();
    expect(hides).toEqual([1]);
  });

  it('never waits on a screen longer than its limit', () => {
    const { handoff, hides, timer } = setup();
    handoff.hold();
    handoff.ready();
    expect(timer()?.ms).toBe(SPLASH_MAX_HOLD_MS);
    timer()?.fn();
    expect(hides).toEqual([1]);
  });

  it('drops its limit once it went', () => {
    const { handoff, timer } = setup();
    const release = handoff.hold();
    handoff.ready();
    release();
    expect(timer()).toBeNull();
  });
});
