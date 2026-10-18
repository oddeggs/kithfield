import type { SignInNonceResponse } from '@kithfield/contracts';

import {
  AuthError,
  type AuthPort,
  type Session,
  type SessionPerson,
  type SocialProvider,
} from './session';

export interface SignInDeps {
  readonly auth: AuthPort;
  readonly session: Session;
  /** `POST /v1/sign-in-nonce`: a single-use nonce, fetched before each Apple or Google sheet. */
  readonly fetchNonce: () => Promise<SignInNonceResponse>;
  /** SHA-256 of a string as lowercase hex (expo-crypto on the phone). */
  readonly sha256Hex: (value: string) => Promise<string>;
}

/**
 * Upgrading the anonymous person, for the sign-in screens. Each call runs with the anonymous
 * bearer, so the server upgrades that person (or merges it into a returning one), then asks whose
 * session this is now; a merge reaches `session.onPersonChanged`.
 */
export function createSignIn(deps: SignInDeps) {
  const { auth, session } = deps;

  return {
    /**
     * Apple or Google: `openSheet` shows the native sheet with the nonce it is given (Apple takes
     * the SHA-256 of the nonce in hex, Google the raw nonce) and answers the identity token.
     */
    async withIdToken(
      provider: SocialProvider,
      openSheet: (sheetNonce: string) => Promise<string>,
    ): Promise<SessionPerson> {
      const { nonce } = await deps.fetchNonce();
      const sheetNonce = provider === 'apple' ? await deps.sha256Hex(nonce) : nonce;
      const token = await openSheet(sheetNonce);
      const answer = await auth.signInSocial({ provider, idToken: { token, nonce } });
      if (answer.error) throw new AuthError(answer.error);
      return session.refresh();
    },

    /** Sends a sign-in code to an email address. */
    async sendEmailCode(email: string): Promise<void> {
      const answer = await auth.sendEmailCode(email);
      if (answer.error) throw new AuthError(answer.error);
    },

    /** Signs in with the code from the email. */
    async withEmailCode(email: string, code: string): Promise<SessionPerson> {
      const answer = await auth.signInEmailCode(email, code);
      if (answer.error) throw new AuthError(answer.error);
      return session.refresh();
    },
  };
}

export type SignIn = ReturnType<typeof createSignIn>;
