import type { PersonId } from '@kithfield/contracts';

/** Where the session lives: the Keychain (expo-secure-store) on the phone. */
export interface SessionStorage {
  getItem(key: string): string | null;
  getItemAsync(key: string): Promise<string | null>;
  setItem(key: string, value: string): void;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** How Better Auth's client reports a failure: it answers `{data: null, error}`, never throws. */
export interface AuthFailure {
  readonly status?: number | undefined;
  readonly code?: string | undefined;
}

/** What Better Auth's client answers for a session or a sign-in. */
export interface SessionAnswer {
  readonly data: {
    readonly user: { readonly id: string; readonly isAnonymous?: boolean | null };
  } | null;
  readonly error?: AuthFailure | null;
}

export type SocialProvider = 'apple' | 'google';

/** The calls the session makes on Better Auth's client (`auth-client.ts` adapts the real one). */
export interface AuthPort {
  getSession(): Promise<SessionAnswer>;
  signInAnonymous(): Promise<SessionAnswer>;
  signInSocial(input: {
    provider: SocialProvider;
    idToken: { token: string; nonce: string };
  }): Promise<SessionAnswer>;
  sendEmailCode(email: string): Promise<{ readonly error?: AuthFailure | null }>;
  signInEmailCode(email: string, otp: string): Promise<SessionAnswer>;
  signOut(): Promise<unknown>;
}

export interface SessionPerson {
  readonly person: PersonId;
  readonly anonymous: boolean;
}

/** The stored session no longer works (revoked, expired, signed out elsewhere): sign in again. */
export class SessionEnded extends Error {
  constructor() {
    super('The session has ended');
    this.name = 'SessionEnded';
  }
}

/** Better Auth refused or failed; `status` 429 and 5xx are worth retrying later. */
export class AuthError extends Error {
  constructor(readonly failure: AuthFailure) {
    super(`Auth failed: ${failure.status ?? '?'} ${failure.code ?? ''}`.trim());
    this.name = 'AuthError';
  }
}

export const BEARER_KEY = 'kithfield.bearer';
const PERSON_KEY = 'kithfield.person';

/**
 * Better Auth fetch options for a bearer-only client: no cookies, the token from the server's
 * bearer plugin (`set-auth-token`) kept in the Keychain and sent on every request.
 */
export function bearerFetchOptions(storage: SessionStorage) {
  return {
    credentials: 'omit' as const,
    onSuccess: async (context: { response: Response }) => {
      const token = context.response.headers.get('set-auth-token');
      if (token) await storage.setItemAsync(BEARER_KEY, token);
    },
    auth: {
      type: 'Bearer' as const,
      token: () => storage.getItem(BEARER_KEY) || undefined,
    },
  };
}

const failed = (answer: { readonly error?: AuthFailure | null }) => {
  if (answer.error) throw new AuthError(answer.error);
};

/**
 * The person this phone acts as. A new install becomes an anonymous person; signing in later
 * upgrades it, or (a returning identity) merges it into another person, which `onPersonChanged`
 * announces. A transient failure (no network, 429, 5xx) never replaces the person: a returning
 * install keeps the one it holds, and a first launch throws.
 */
export function createSession(auth: AuthPort, storage: SessionStorage) {
  let current: SessionPerson | null = null;
  const changes = new Set<(from: SessionPerson | null, to: SessionPerson) => void>();
  const endings = new Set<() => void>();

  const stored = (): SessionPerson | null => {
    const raw = storage.getItem(PERSON_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionPerson;
    } catch {
      return null;
    }
  };

  const remember = async (answer: SessionAnswer): Promise<SessionPerson | null> => {
    failed(answer);
    if (!answer.data) return null;
    const before = current ?? stored();
    current = { person: answer.data.user.id, anonymous: answer.data.user.isAnonymous === true };
    await storage.setItemAsync(PERSON_KEY, JSON.stringify(current));
    if (before && before.person !== current.person) {
      for (const listener of changes) listener(before, current);
    }
    return current;
  };

  /** Tells the listeners the server no longer knows this session, and makes the error to throw. */
  const ended = (): SessionEnded => {
    for (const listener of endings) listener();
    return new SessionEnded();
  };
  const unauthorized = (error: unknown) =>
    error instanceof AuthError && error.failure.status === 401;

  /** The server's answer, or the person this phone holds when the answer is only "not now". */
  const ask = async (): Promise<SessionPerson | null> => {
    try {
      return await remember(await auth.getSession());
    } catch (error) {
      if (unauthorized(error)) throw ended();
      const held = stored();
      if (held) return (current = held);
      throw error;
    }
  };

  const session = {
    /** The signed-in person, or the one this phone last signed in as. */
    person(): SessionPerson | null {
      return current ?? stored();
    },

    /**
     * Makes sure there is a person: the stored session's, or a new anonymous one when this phone
     * holds nothing. A stored bearer the server no longer knows throws `SessionEnded`; the app
     * then offers sign-in, never a silent new person.
     */
    async ensure(): Promise<SessionPerson> {
      const found = await ask();
      if (found) return found;
      if (storage.getItem(BEARER_KEY)) throw ended();
      const created = await remember(await auth.signInAnonymous());
      if (!created) throw new AuthError({ code: 'no_person' });
      return created;
    },

    /**
     * Asks the server whose session this is, after a sign-in or upgrade. A 401 (thrown as the
     * `AuthError` it is) or no session at all tells the `onEnded` listeners.
     */
    async refresh(): Promise<SessionPerson> {
      let found: SessionPerson | null;
      try {
        found = await remember(await auth.getSession());
      } catch (error) {
        if (unauthorized(error)) ended();
        throw error;
      }
      if (!found) throw ended();
      return found;
    },

    /** Called when the server no longer knows this session (a 401, or no session at all). */
    onEnded(listener: () => void) {
      endings.add(listener);
      return () => endings.delete(listener);
    },

    /** Headers for the API: the bearer token, or none before the first sign-in. */
    async headers(): Promise<Record<string, string>> {
      const bearer = await storage.getItemAsync(BEARER_KEY);
      return bearer ? { authorization: `Bearer ${bearer}` } : {};
    },

    /** Called when signing in moved this phone to another person (a merge). */
    onPersonChanged(listener: (from: SessionPerson | null, to: SessionPerson) => void) {
      changes.add(listener);
      return () => changes.delete(listener);
    },

    /** Forgets the session on this phone. The data client wipes its tables first. */
    async signOut(): Promise<void> {
      await auth.signOut().catch(() => undefined);
      await storage.setItemAsync(BEARER_KEY, '');
      await storage.setItemAsync(PERSON_KEY, '');
      current = null;
    },
  };
  return session;
}

export type Session = ReturnType<typeof createSession>;
