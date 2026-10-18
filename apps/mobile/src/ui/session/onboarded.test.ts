import { describe, expect, it } from '@jest/globals';

import { me } from './me.test-data';
import { isOnboarded, readOnboarded, writeOnboarded, type OnboardedStore } from './onboarded';

function memory(): OnboardedStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItemAsync: (key, value) => Promise.resolve(void values.set(key, value)),
  };
}

describe('onboarded', () => {
  it('needs a name, a critter, the age check and the Terms in force', () => {
    expect(isOnboarded(me())).toBe(true);
    expect(isOnboarded(me({ name: null }))).toBe(false);
    expect(isOnboarded(me({ critter: null }))).toBe(false);
    expect(isOnboarded(me({ ageOk: false }))).toBe(false);
    expect(isOnboarded(me({ termsVersion: null }))).toBe(false);
  });

  it('asks again when the Terms in force change', () => {
    expect(isOnboarded(me({ termsVersion: '2026-01-01' }))).toBe(false);
  });

  it('remembers the person it saw onboarded, and forgets them when they no longer are', async () => {
    const store = memory();
    expect(readOnboarded(store, 'p1')).toBe(false);
    await writeOnboarded(store, 'p1', true);
    expect(readOnboarded(store, 'p1')).toBe(true);
    expect(readOnboarded(store, 'p2')).toBe(false);
    await writeOnboarded(store, 'p2', false);
    expect(readOnboarded(store, 'p1')).toBe(true);
    await writeOnboarded(store, 'p1', false);
    expect(readOnboarded(store, 'p1')).toBe(false);
  });

  it('counts a store that cannot be read as not remembered', () => {
    const broken: OnboardedStore = {
      getItem: () => {
        throw new Error('locked');
      },
      setItemAsync: () => Promise.resolve(),
    };
    expect(readOnboarded(broken, 'p1')).toBe(false);
  });
});
