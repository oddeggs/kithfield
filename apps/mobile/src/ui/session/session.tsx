import { createContext, useContext, type ReactNode } from 'react';

/**
 * Who is using the app, as far as the shell needs to know: whether anyone is signed in yet, and
 * whether they are through the way in.
 */
export interface Session {
  /**
   * `loading` while the session is read from the phone, and while a person the phone hasn't seen
   * onboarded is checked with the server: the splash stays up meanwhile.
   */
  status: 'loading' | 'signedOut' | 'signedIn';
  /** The signed-in person, or null. */
  person: { id: string } | null;
  /**
   * They have a name and a critter, are old enough and accepted the Terms in force: the app shows
   * the tabs. Until then it shows onboarding, which ends by asking the account to check again.
   */
  onboarded: boolean;
}

/**
 * Nobody signed in: the session before the app has a sign-in client. The data layer's session
 * client replaces it at the provider slot in the root layout.
 */
export const signedOut: Session = { status: 'signedOut', person: null, onboarded: false };

const SessionContext = createContext<Session>(signedOut);

/** Provides the session to the root layout's sign-in gate and to every screen. */
export function SessionProvider({
  session,
  children,
}: {
  readonly session: Session;
  readonly children: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
