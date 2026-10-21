import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { foldClock, HEADER_FOLD_MS } from './header-fold';

describe('a chat header folding its farm away', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const start = () => {
    const changes: boolean[] = [];
    const clock = foldClock((open) => changes.push(open));
    return { clock, changes };
  };

  it('shows the whole farm on the way in and folds it after three seconds', () => {
    const { clock, changes } = start();
    expect(clock.open()).toBe(true);
    jest.advanceTimersByTime(HEADER_FOLD_MS - 1);
    expect(clock.open()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(clock.open()).toBe(false);
    expect(changes).toEqual([false]);
  });

  it('folds at the first use of the chat, sooner than the clock, and only once', () => {
    const { clock, changes } = start();
    jest.advanceTimersByTime(500);
    clock.interact();
    clock.interact();
    jest.advanceTimersByTime(HEADER_FOLD_MS * 2);
    expect(clock.open()).toBe(false);
    expect(changes).toEqual([false]);
  });

  it('shows the farm again on a tap, then folds it again after three seconds', () => {
    const { clock, changes } = start();
    clock.interact();
    clock.toggle();
    expect(clock.open()).toBe(true);
    jest.advanceTimersByTime(HEADER_FOLD_MS);
    expect(changes).toEqual([false, true, false]);
  });

  it('starts the three seconds over from the tap, not from the way in', () => {
    const { clock } = start();
    jest.advanceTimersByTime(HEADER_FOLD_MS);
    jest.advanceTimersByTime(1000);
    clock.toggle();
    jest.advanceTimersByTime(HEADER_FOLD_MS - 1);
    expect(clock.open()).toBe(true);
    clock.interact();
    expect(clock.open()).toBe(false);
  });

  it('folds the open farm on a tap', () => {
    const { clock, changes } = start();
    clock.toggle();
    expect(changes).toEqual([false]);
  });

  it('waits for the person rather than the clock while a screen reader runs', () => {
    const { clock, changes } = start();
    clock.hold(true);
    jest.advanceTimersByTime(HEADER_FOLD_MS * 3);
    expect(clock.open()).toBe(true);
    clock.interact();
    expect(changes).toEqual([false]);
    clock.toggle();
    jest.advanceTimersByTime(HEADER_FOLD_MS * 3);
    expect(clock.open()).toBe(true);
  });

  it('goes back to the clock when the screen reader stops', () => {
    const { clock } = start();
    clock.hold(true);
    clock.hold(false);
    jest.advanceTimersByTime(HEADER_FOLD_MS);
    expect(clock.open()).toBe(false);
  });

  it('does nothing after the chat closes', () => {
    const { clock, changes } = start();
    clock.dispose();
    jest.advanceTimersByTime(HEADER_FOLD_MS * 2);
    expect(changes).toEqual([]);
  });
});
