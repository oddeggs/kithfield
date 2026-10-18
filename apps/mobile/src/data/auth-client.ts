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
  readonly storage: SessionStorage;
}

/**
 * Better Auth's client for the app, bearer only: no cookies are sent or kept, and the token lives
 * in the Keychain. Apple and Google sign in with identity tokens from the native sheets, so no
 * browser is involved.
 */
export function createKithfieldAuthClient(config: AuthClientConfig) {
  return createAuthClient({
    baseURL: `${config.apiBase}/auth`,
    fetchOptions: bearerFetchOptions(config.storage),
    plugins: [anonymousClient(), emailOTPClient()],
  });
}

export type KithfieldAuthClient = ReturnType<typeof createKithfieldAuthClient>;

const answer = (value: unknown) => value as SessionAnswer;

/** The session's view of the client. */
export function authPort(client: KithfieldAuthClient): AuthPort {
  return {
    getSession: async () => answer(await client.getSession()),
    signInAnonymous: async () => answer(await client.signIn.anonymous()),
    signInSocial: async (input) => answer(await client.signIn.social(input)),
    sendEmailCode: async (email) =>
      answer(await client.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })),
    signInEmailCode: async (email, otp) => answer(await client.signIn.emailOtp({ email, otp })),
    signOut: () => client.signOut(),
  };
}
