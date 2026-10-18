import { describe, expect, it } from '@jest/globals';

import { PERSON_KEYS, signOutSequence, type SignOutDeps } from './sign-out';

function phone(signOut: SignOutDeps['client']['signOut']) {
  const steps: string[] = [];
  const deps: SignOutDeps = {
    client: {
      signOut: async (options) => {
        steps.push(`client.signOut ${options.force ? 'force' : 'check'}`);
        return signOut(options);
      },
      store: {
        transaction: async (work: () => Promise<unknown>) => {
          await work();
        },
        wipe: () => {
          steps.push('wipe');
          return Promise.resolve();
        },
      } as unknown as SignOutDeps['client']['store'],
      stop: () => steps.push('stop'),
      report: () => undefined,
    },
    endSession: () => {
      steps.push('endSession');
      return Promise.resolve();
    },
    clearKey: (key) => {
      steps.push(`clear ${key}`);
      return Promise.resolve();
    },
    restart: () => steps.push('restart'),
    clearHeld: () => {
      steps.push('clearHeld');
      return Promise.resolve();
    },
  };
  return { deps, steps };
}

const cleared = Object.values(PERSON_KEYS).map((k) => `clear ${k}`);

describe('signing out of this phone', () => {
  it('stops before anything is lost when writes still wait', async () => {
    const { deps, steps } = phone(() => Promise.resolve({ unsent: 2, signedOut: false }));
    await expect(signOutSequence(deps, { anyway: false })).resolves.toEqual({
      status: 'unsent',
      unsent: 2,
    });
    expect(steps).toEqual(['client.signOut check']);
  });

  it('signs out anyway: the client wipes, then the session ends, keys clear and it restarts', async () => {
    const { deps, steps } = phone(() => Promise.resolve({ unsent: 2, signedOut: true }));
    await expect(signOutSequence(deps, { anyway: true })).resolves.toEqual({
      status: 'signedOut',
    });
    expect(steps).toEqual(['client.signOut force', 'endSession', ...cleared, 'stop', 'restart']);
  });

  it('offline, still ends the session, wipes the tables and the media queue itself and restarts', async () => {
    const { deps, steps } = phone(() => Promise.reject(new TypeError('Network request failed')));
    await expect(signOutSequence(deps, { anyway: false })).resolves.toEqual({
      status: 'signedOut',
    });
    expect(steps).toEqual([
      'client.signOut check',
      'endSession',
      'wipe',
      'clearHeld',
      ...cleared,
      'stop',
      'restart',
    ]);
  });

  it('goes on when ending the session on the server fails', async () => {
    const { deps, steps } = phone(() => Promise.resolve({ unsent: 0, signedOut: true }));
    const failing: SignOutDeps = {
      ...deps,
      endSession: () => {
        steps.push('endSession');
        return Promise.reject(new TypeError('Network request failed'));
      },
    };
    await signOutSequence(failing, { anyway: false });
    expect(steps.slice(-2)).toEqual(['stop', 'restart']);
    expect(steps).toEqual(expect.arrayContaining(cleared));
  });
});
