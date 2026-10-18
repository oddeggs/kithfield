import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import type { DataClient } from '../../data/data-client';
import { useDataClient } from '../../data/react';
import { BEARER_KEY } from '../../data/session';

/** Keychain entries that belong to the person signed in, cleared when they sign out. */
export const PERSON_KEYS = {
  aiCatchUp: 'kithfield.pref.aiCatchUp',
  /** Which removal notices were shown, one JSON list. */
  removalShown: 'kithfield.removalShown',
} as const;

const SESSION_KEYS = [BEARER_KEY, 'kithfield.person'] as const;

export interface SignOutDeps {
  readonly client: Pick<DataClient, 'signOut' | 'store' | 'stop' | 'report'>;
  /** Ends the session on the server and forgets the bearer and the person in the Keychain. */
  readonly endSession: () => Promise<void>;
  readonly clearKey: (key: string) => Promise<void>;
  /** Starts the data layer again from nothing. */
  readonly restart: () => void;
  /**
   * Clears what the person keeps outside the data layer (the media queue). The data layer's own
   * sign-out already counts and clears it; this runs only when that couldn't finish.
   */
  readonly clearHeld?: () => Promise<void>;
}

export type SignOutResult =
  | { readonly status: 'signedOut' }
  /** Writes still wait; signing out anyway leaves them behind. */
  | { readonly status: 'unsent'; readonly unsent: number };

const quietly = async (work: () => Promise<unknown>) => {
  try {
    await work();
  } catch {
    // Signing out goes on: every step after this one still runs.
  }
};

/**
 * Signs this phone out: sends what it can (or stops to say what would be lost), then always ends
 * the session and forgets it, wipes the phone's copy even when the network is gone, clears the
 * person's own keys and starts the data layer again.
 */
export async function signOutSequence(
  deps: SignOutDeps,
  options: { readonly anyway: boolean },
): Promise<SignOutResult> {
  let wiped = false;
  try {
    const result = await deps.client.signOut({ force: options.anyway });
    if (!result.signedOut) return { status: 'unsent', unsent: result.unsent };
    wiped = true;
  } catch {
    // Offline or failing: the session still ends and the tables are wiped below.
  }
  await quietly(deps.endSession);
  if (!wiped) {
    const { store } = deps.client;
    await quietly(() => store.transaction(() => store.wipe()));
    if (deps.clearHeld) await quietly(deps.clearHeld);
  }
  for (const key of Object.values(PERSON_KEYS)) await quietly(() => deps.clearKey(key));
  deps.client.stop();
  deps.restart();
  return { status: 'signedOut' };
}

interface Scope {
  readonly endSession: () => Promise<void>;
  readonly restart: () => void;
  readonly clearHeld?: () => Promise<void>;
}

const SignOutContext = createContext<Scope | null>(null);

/**
 * Where the data slot hands sign-out its session, its restart and what it keeps outside the data
 * layer: `<SignOutScope endSession={() => runtime.session.signOut()} restart={retry}>`.
 */
export function SignOutScope(props: Scope & { readonly children: ReactNode }) {
  const { endSession, restart, clearHeld, children } = props;
  const value = useMemo(
    () => ({ endSession, restart, ...(clearHeld ? { clearHeld } : {}) }),
    [endSession, restart, clearHeld],
  );
  return createElement(SignOutContext.Provider, { value }, children);
}

const clearKey = (key: string) => SecureStore.deleteItemAsync(key);

/** Signs out of this phone. Without a scope, the Keychain is cleared here and the app signed out. */
export function useSignOut(): (options: { anyway: boolean }) => Promise<SignOutResult> {
  const client = useDataClient();
  const scope = useContext(SignOutContext);
  return useCallback(
    (options) =>
      signOutSequence(
        {
          client,
          clearKey,
          endSession:
            scope?.endSession ??
            (async () => {
              for (const key of SESSION_KEYS) await SecureStore.setItemAsync(key, '');
            }),
          restart: scope?.restart ?? (() => client.endSession()),
          ...(scope?.clearHeld ? { clearHeld: scope.clearHeld } : {}),
        },
        options,
      ),
    [client, scope],
  );
}
