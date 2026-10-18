import type { Me } from '@kithfield/contracts';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { DataRuntime, SignIn } from '../../data';
import { isOnboarded, readOnboarded, writeOnboarded, type OnboardedStore } from './onboarded';

/** What the way in needs from the data layer beyond the hooks: signing in and the person. */
export interface Account {
  /** Apple, Google and email-code sign-in, upgrading this phone's anonymous person. */
  readonly signIn: SignIn;
  /** The bearer header, for the person's own calls the API client doesn't make. */
  readonly authHeaders: () => Promise<Record<string, string>>;
  /** Reads the person again and lets the app through once they are onboarded. */
  readonly recheck: () => Promise<Me>;
  /** Forgets this phone's person and wipes its tables, as when the age check refuses. */
  readonly forget: () => Promise<void>;
}

const AccountContext = createContext<Account | null>(null);

export function AccountProvider({
  account,
  children,
}: {
  readonly account: Account;
  readonly children: ReactNode;
}) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (account === null) throw new Error('useAccount needs the data slot');
  return account;
}

// The same Keychain class as the session itself, so both survive a restore together.
const keychain: OnboardedStore = {
  getItem: (key) =>
    SecureStore.getItem(key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  setItemAsync: (key, value) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
};

type Known = { readonly person: string; readonly onboarded: boolean };

/**
 * Whether `person` is onboarded: at once from what the phone remembers, then checked with
 * `GET /v1/me` in the background (new Terms send them back to accept). A person this phone
 * hasn't seen onboarded waits for that one read, under the splash. Null while unknown.
 */
export function useOnboarded(
  runtime: DataRuntime<unknown>,
  person: string | null,
): { readonly onboarded: boolean | null; readonly recheck: () => Promise<Me> } {
  const [known, setKnown] = useState<Known | null>(null);

  const settle = useCallback(async (who: string, me: Me) => {
    const onboarded = isOnboarded(me);
    setKnown({ person: who, onboarded });
    await writeOnboarded(keychain, who, onboarded).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (person === null) return;
    let live = true;
    const remembered = readOnboarded(keychain, person);
    setKnown(remembered ? { person, onboarded: true } : null);
    runtime.client.api.me().then(
      (me) => live && void settle(person, me),
      // Offline or refused: someone remembered stays in; anyone else starts at the way in.
      () => live && !remembered && setKnown({ person, onboarded: false }),
    );
    return () => {
      live = false;
    };
  }, [runtime, person, settle]);

  const recheck = useCallback(async () => {
    const me = await runtime.client.api.me();
    await settle(me.person, me);
    return me;
  }, [runtime, settle]);

  const onboarded = known !== null && known.person === person ? known.onboarded : null;
  return { onboarded, recheck };
}

/** The account for the screens, from the data layer's runtime. */
export function useRuntimeAccount(
  runtime: DataRuntime<unknown>,
  recheck: () => Promise<Me>,
): Account {
  return useMemo(
    () => ({
      signIn: runtime.signIn,
      authHeaders: () => runtime.session.headers(),
      recheck,
      forget: async () => {
        await runtime.client.signOut({ force: true });
        await runtime.session.signOut();
      },
    }),
    [runtime, recheck],
  );
}
