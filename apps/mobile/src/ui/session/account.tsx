import type { Me } from '@kithfield/contracts';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import type { DataRuntime, SignIn } from '../../data';
import { forgetPerson } from './forget';
import { useOnboardedState } from './onboarded-state';
import { keychain, pushDeps } from './push-registration';
import { syncPush } from './push-sync';

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
  /** Sends the push token and time zone now, as right after notifications are allowed. */
  readonly registerPush: () => Promise<void>;
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

/** Whether the person is onboarded, answered on the first render (see `useOnboardedState`). */
export function useOnboarded(runtime: DataRuntime<unknown>, person: string | null) {
  const me = useCallback(() => runtime.client.api.me(), [runtime]);
  const deps = useMemo(() => ({ store: keychain, me }), [me]);
  return useOnboardedState(person, deps);
}

/** The account for the screens, from the data layer's runtime. */
export function useRuntimeAccount(
  runtime: DataRuntime<unknown>,
  person: string | null,
  recheck: () => Promise<Me>,
  dropped: () => void,
): Account {
  const push = useMemo(() => pushDeps(runtime), [runtime]);
  return useMemo(
    () => ({
      signIn: runtime.signIn,
      authHeaders: () => runtime.session.headers(),
      recheck,
      forget: () =>
        forgetPerson({
          wipe: () => runtime.client.signOut({ force: true }),
          signOut: () => runtime.session.signOut(),
          store: keychain,
          dropped,
        }),
      registerPush: async () => {
        if (person !== null) await syncPush(person, push).catch(() => undefined);
      },
    }),
    [runtime, person, recheck, dropped, push],
  );
}
