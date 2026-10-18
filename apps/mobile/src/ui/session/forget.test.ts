import { describe, expect, it } from '@jest/globals';

import { forgetPerson } from './forget';
import { readOnboarded, type OnboardedStore } from './onboarded';

function memory(remembered: string): OnboardedStore {
  const values = new Map([['kithfield.onboarded', remembered]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItemAsync: (key, value) => Promise.resolve(void values.set(key, value)),
  };
}

describe('forgetting the person on this phone', () => {
  it('wipes, signs out, forgets the onboarded person and drops them from the shell', async () => {
    const steps: string[] = [];
    const store = memory('p1');
    await forgetPerson({
      wipe: () => Promise.resolve(void steps.push('wipe')),
      signOut: () => Promise.resolve(void steps.push('signOut')),
      store,
      dropped: () => steps.push('dropped'),
    });
    expect(steps).toEqual(['wipe', 'signOut', 'dropped']);
    expect(readOnboarded(store, 'p1')).toBe(false);
  });

  it('still forgets when the server already removed the person', async () => {
    const store = memory('p1');
    let dropped = false;
    await forgetPerson({
      wipe: () => Promise.reject(new Error('401')),
      signOut: () => Promise.reject(new Error('401')),
      store,
      dropped: () => {
        dropped = true;
      },
    });
    expect(dropped).toBe(true);
    expect(readOnboarded(store, 'p1')).toBe(false);
  });
});
