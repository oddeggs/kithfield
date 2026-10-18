import { describe, expect, it, jest } from '@jest/globals';
import type { View } from 'react-native';
import type { AnimatedRef } from 'react-native-reanimated';

import { AnchorRegistry } from './registry';

jest.mock('react-native-reanimated', () => ({
  makeMutable: <T>(start: T) => {
    let current = start;
    return { get: () => current, set: (next: T) => void (current = next) };
  },
}));

const ref = () => (() => 1) as unknown as AnimatedRef<View>;

describe('the anchor registry', () => {
  it('keeps an entry while something holds it, and lets it go after', () => {
    const r = new AnchorRegistry();
    const held = r.hold('a');
    expect(r.peek('a')).toBe(held);
    expect(r.hold('a')).toBe(held);
    r.release('a');
    expect(r.peek('a')).toBe(held);
    r.release('a');
    expect(r.peek('a')).toBeUndefined();
  });

  it('says an anchor is on screen only while its view is attached', () => {
    const r = new AnchorRegistry();
    const heard: number[] = [];
    r.listen(() => heard.push(1));
    const detach = r.attach('a', ref());
    expect(r.has('a')).toBe(true);
    detach();
    expect(r.has('a')).toBe(false);
    expect(r.peek('a')).toBeUndefined();
    expect(heard).toHaveLength(2);
  });

  it('gives back a drawing hidden for a flight when its view leaves', () => {
    const r = new AnchorRegistry();
    const flight = r.hold('a');
    const detach = r.attach('a', ref());
    flight.shown.set(0);
    flight.hidden.set(2);
    detach();
    expect(flight.shown.get()).toBe(1);
    expect(flight.hidden.get()).toBe(0);
    // The flight still holds it, so the entry is kept for the view to come back to.
    expect(r.peek('a')).toBe(flight);
  });

  it('keeps the newer view when two attach under one id', () => {
    const r = new AnchorRegistry();
    const first = ref();
    const second = ref();
    const detachFirst = r.attach('a', first);
    r.attach('a', second);
    detachFirst();
    expect(r.peek('a')?.ref).toBe(second);
    expect(r.has('a')).toBe(true);
  });
});
