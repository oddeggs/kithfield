import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/client';
import { anonymousClient, emailOTPClient } from 'better-auth/client/plugins';

import {
  bearerFetchOptions,
  type AuthPort,
  type SessionAnswer,
  type SessionStorage,
} from './session';

export interface AuthClientConfig {
  /** The API base, such as `https://dev.kithfield.com/api`; Better Auth answers under `/auth`. */
  readonly apiBase: string;
  /** The app's URL scheme, which the server trusts as this app's origin. */
  readonly scheme: string;
  readonly storage: SessionStorage;
}

/**
 * Better Auth's client for the app: the Expo plugin keeps cookies in the Keychain, the bearer
 * token is kept beside them, and the anonymous and email-code plugins give the sign-in screens
 * their typed calls.
 */
export function createKithfieldAuthClient(config: AuthClientConfig) {
  return createAuthClient({
    baseURL: `${config.apiBase}/auth`,
    fetchOptions: bearerFetchOptions(config.storage),
    plugins: [
      expoClient({ scheme: config.scheme, storage: config.storage, disableCache: true }),
      anonymousClient(),
      emailOTPClient(),
    ],
  });
}

export type KithfieldAuthClient = ReturnType<typeof createKithfieldAuthClient>;

/** The session's view of the client. */
export function authPort(client: KithfieldAuthClient): AuthPort {
  return {
    getSession: async () => (await client.getSession()) as SessionAnswer,
    signInAnonymous: async () => (await client.signIn.anonymous()) as SessionAnswer,
    getCookie: () => client.getCookie(),
    signOut: () => client.signOut(),
  };
}
