import type { PersonId } from '@kithfield/contracts';

/** Where the session lives: the Keychain (expo-secure-store) on the phone. */
export interface SessionStorage {
  getItem(key: string): string | null;
  getItemAsync(key: string): Promise<string | null>;
  setItem(key: string, value: string): void;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** What Better Auth's client answers for a session or a sign-in. */
export interface SessionAnswer {
  readonly data: {
    readonly user: { readonly id: string; readonly isAnonymous?: boolean | null };
  } | null;
  readonly error?: unknown;
}

/** The calls the session makes on Better Auth's client (`auth-client.ts` adapts the real one). */
export interface AuthPort {
  getSession(): Promise<SessionAnswer>;
  signInAnonymous(): Promise<SessionAnswer>;
  /** The session cookie the Expo plugin keeps, for requests outside Better Auth. */
  getCookie(): Promise<string>;
  signOut(): Promise<unknown>;
}

export interface SessionPerson {
  readonly person: PersonId;
  readonly anonymous: boolean;
}

export const BEARER_KEY = 'kithfield.bearer';
const PERSON_KEY = 'kithfield.person';

/**
 * Better Auth fetch options that keep the bearer token in the Keychain: the server's bearer plugin
 * hands it back in `set-auth-token`, and every later request sends it.
 */
export function bearerFetchOptions(storage: SessionStorage) {
  return {
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

/**
 * The person this phone acts as. Every install gets an anonymous person first; signing in with
 * Apple, Google or an email code later upgrades the same person (the sign-in screens call Better
 * Auth's client directly). Offline, a returning install keeps the person it last had.
 */
export function createSession(auth: AuthPort, storage: SessionStorage) {
  let current: SessionPerson | null = null;

  const remember = async (answer: SessionAnswer): Promise<SessionPerson | null> => {
    if (!answer.data) return null;
    current = { person: answer.data.user.id, anonymous: answer.data.user.isAnonymous === true };
    await storage.setItemAsync(PERSON_KEY, JSON.stringify(current));
    return current;
  };

  const stored = (): SessionPerson | null => {
    const raw = storage.getItem(PERSON_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionPerson;
    } catch {
      return null;
    }
  };

  return {
    /** The signed-in person, or the one this phone last signed in as. */
    person(): SessionPerson | null {
      return current ?? stored();
    },

    /**
     * Makes sure there is a session: reuses the stored one, or creates the anonymous person.
     * Without a network a returning install keeps its last person; a first launch throws.
     */
    async ensure(): Promise<SessionPerson> {
      try {
        const existing = await remember(await auth.getSession());
        if (existing) return existing;
        const created = await remember(await auth.signInAnonymous());
        if (created) return created;
        throw new Error('Anonymous sign-in did not answer with a person');
      } catch (error) {
        const previous = stored();
        if (previous) return (current = previous);
        throw error;
      }
    },

    /** Headers for the API: the bearer token, or the session cookie when there is none. */
    async headers(): Promise<Record<string, string>> {
      const bearer = await storage.getItemAsync(BEARER_KEY);
      if (bearer) return { authorization: `Bearer ${bearer}` };
      const cookie = await auth.getCookie();
      return cookie ? { cookie } : {};
    },

    async signOut(): Promise<void> {
      await auth.signOut().catch(() => undefined);
      await storage.setItemAsync(BEARER_KEY, '');
      await storage.setItemAsync(PERSON_KEY, '');
      current = null;
    },
  };
}

export type Session = ReturnType<typeof createSession>;
