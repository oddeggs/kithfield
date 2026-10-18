import { describe, expect, it } from '@jest/globals';

import { createApiClient } from './api-client';
import {
  AuthError,
  BEARER_KEY,
  SessionEnded,
  bearerFetchOptions,
  createSession,
  type AuthFailure,
  type AuthPort,
  type SessionAnswer,
  type SessionStorage,
} from './session';
import { createSignIn } from './sign-in';

function memoryStorage(): SessionStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    getItemAsync: (key) => Promise.resolve(values.get(key) ?? null),
    setItem: (key, value) => void values.set(key, value),
    setItemAsync: (key, value) => Promise.resolve(void values.set(key, value)),
  };
}

type User = { id: string; isAnonymous: boolean };

/*
 * A stand-in for the Better Auth server behind the client (it is being built alongside). Like the
 * real client, it answers `{data, error}` and never throws for an HTTP failure; it throws only
 * when there is no network. The bearer fetch options run on its answers, so the token it hands
 * back in `set-auth-token` lands in storage as it would on the phone.
 */
function fakeAuth(storage: SessionStorage) {
  const sessions = new Map<string, User>();
  const state = {
    online: true,
    signIns: 0,
    /** The next answers fail with these, in order. */
    failures: [] as AuthFailure[],
    social: [] as { provider: string; token: string; nonce: string }[],
    codes: new Map<string, string>(),
    /** Who a social or email identity belongs to; unknown ones upgrade the anonymous person. */
    identities: new Map<string, string>(),
  };
  const options = bearerFetchOptions(storage);
  const user = () => sessions.get(options.auth.token() ?? '') ?? null;

  const call = async (
    answer: () => { user: User | null; token?: string },
  ): Promise<SessionAnswer> => {
    await Promise.resolve();
    if (!state.online) throw new TypeError('Network request failed');
    const failure = state.failures.shift();
    if (failure) return { data: null, error: failure };
    const { user: found, token } = answer();
    const headers: Record<string, string> = token ? { 'set-auth-token': token } : {};
    await options.onSuccess({ response: new Response('{}', { headers }) });
    return { data: found ? { user: found } : null, error: null };
  };

  const issue = (u: User) => {
    const token = `tok_${sessions.size + 1}_${'z'.repeat(24)}`;
    sessions.set(token, u);
    return { user: u, token };
  };

  /** Signs the current person in as `identity`: an upgrade, or a merge into its owner. */
  const upgrade = (identity: string) => {
    const me = user();
    const owner = state.identities.get(identity) ?? me?.id ?? 'p_new';
    state.identities.set(identity, owner);
    return issue({ id: owner, isAnonymous: false });
  };

  const port: AuthPort = {
    getSession: () => call(() => ({ user: user() })),
    signInAnonymous: () =>
      call(() => {
        state.signIns += 1;
        return issue({ id: `p_anon${state.signIns}`, isAnonymous: true });
      }),
    signInSocial: ({ provider, idToken }) =>
      call(() => {
        state.social.push({ provider, ...idToken });
        return upgrade(`${provider}:${idToken.token}`);
      }),
    sendEmailCode: async (email) => {
      state.codes.set(email, '123456');
      return Promise.resolve({ error: null });
    },
    signInEmailCode: (email, otp) =>
      call(() => (state.codes.get(email) === otp ? upgrade(`email:${email}`) : { user: null })),
    signOut: () => Promise.resolve(),
  };
  return { port, state };
}

const start = () => {
  const storage = memoryStorage();
  const auth = fakeAuth(storage);
  const session = createSession(auth.port, storage);
  return { storage, auth, session };
};

describe('starting a session', () => {
  it('starts anonymous on first launch and keeps the bearer in the Keychain', async () => {
    const { storage, session } = start();
    expect(await session.ensure()).toEqual({ person: 'p_anon1', anonymous: true });
    const token = storage.values.get(BEARER_KEY);
    expect(await session.headers()).toEqual({ authorization: `Bearer ${token}` });

    const seen: (string | null)[] = [];
    const api = createApiClient({
      baseUrl: 'https://test.kithfield.invalid/api',
      fetch: (_input, init) => {
        seen.push(new Headers(init?.headers).get('authorization'));
        const body = JSON.stringify({ token: 'rt_'.padEnd(20, 'x'), expiresAt: 1 });
        return Promise.resolve(new Response(body, { status: 200 }));
      },
      authHeaders: () => session.headers(),
    });
    await api.rtToken('f_lot');
    expect(seen).toEqual([`Bearer ${token}`]);
  });

  it('reuses the stored session instead of making a new person', async () => {
    const { storage, auth } = start();
    await createSession(auth.port, storage).ensure();
    expect(await createSession(auth.port, storage).ensure()).toMatchObject({ person: 'p_anon1' });
    expect(auth.state.signIns).toBe(1);
  });

  it.each([429, 500, 503])(
    'keeps the person through a %i, never making a new one',
    async (status) => {
      const { storage, auth } = start();
      await createSession(auth.port, storage).ensure();
      auth.state.failures.push({ status });
      const relaunched = createSession(auth.port, storage);
      expect(await relaunched.ensure()).toEqual({ person: 'p_anon1', anonymous: true });
      expect(auth.state.signIns).toBe(1);
      expect(relaunched.person()).toEqual({ person: 'p_anon1', anonymous: true });
    },
  );

  it('keeps the person offline, and can’t start offline on a first launch', async () => {
    const { storage, auth } = start();
    await createSession(auth.port, storage).ensure();
    auth.state.online = false;
    expect(await createSession(auth.port, storage).ensure()).toMatchObject({ person: 'p_anon1' });

    const fresh = start();
    fresh.auth.state.online = false;
    await expect(fresh.session.ensure()).rejects.toThrow('Network request failed');
    expect(fresh.session.person()).toBeNull();
  });

  it('throws instead of making a person when the first sign-in fails', async () => {
    const { auth, session } = start();
    auth.state.failures.push({ status: 503 });
    await expect(session.ensure()).rejects.toThrow(AuthError);
    auth.state.failures.push({ status: 429 });
    await expect(session.ensure()).rejects.toThrow(AuthError);
    expect(session.person()).toBeNull();
  });

  it('says the session ended, keeping the person, when the server no longer knows the bearer', async () => {
    const { storage, auth, session } = start();
    await session.ensure();
    storage.values.set(BEARER_KEY, `revoked_${'q'.repeat(24)}`);
    const relaunched = createSession(auth.port, storage);
    await expect(relaunched.ensure()).rejects.toThrow(SessionEnded);
    auth.state.failures.push({ status: 401 });
    await expect(relaunched.ensure()).rejects.toThrow(SessionEnded);
    expect(auth.state.signIns).toBe(1);
    expect(relaunched.person()).toMatchObject({ person: 'p_anon1' });
  });

  it('forgets the person and the bearer on sign-out', async () => {
    const { session } = start();
    await session.ensure();
    await session.signOut();
    expect(session.person()).toBeNull();
    expect(await session.headers()).toEqual({});
  });
});

describe('signing in', () => {
  const nonce = 'n'.repeat(43);
  const deps = (s: ReturnType<typeof start>) => ({
    auth: s.auth.port,
    session: s.session,
    fetchNonce: () => Promise.resolve({ nonce, expiresAt: 1 }),
    sha256Hex: (value: string) => Promise.resolve(`sha256(${value})`),
  });

  it('gives Apple the hashed nonce and the server the raw one, then upgrades the person', async () => {
    const s = start();
    await s.session.ensure();
    const sheets: string[] = [];
    const signIn = createSignIn(deps(s));
    const person = await signIn.withIdToken('apple', (sheetNonce) => {
      sheets.push(sheetNonce);
      return Promise.resolve('apple-id-token');
    });
    expect(sheets).toEqual([`sha256(${nonce})`]);
    expect(s.auth.state.social).toEqual([{ provider: 'apple', token: 'apple-id-token', nonce }]);
    expect(person).toEqual({ person: 'p_anon1', anonymous: false });
  });

  it('gives Google the raw nonce', async () => {
    const s = start();
    await s.session.ensure();
    const sheets: string[] = [];
    await createSignIn(deps(s)).withIdToken('google', (sheetNonce) => {
      sheets.push(sheetNonce);
      return Promise.resolve('google-id-token');
    });
    expect(sheets).toEqual([nonce]);
  });

  it('announces a merge into a returning person', async () => {
    const s = start();
    await s.session.ensure();
    s.auth.state.identities.set('email:bea@example.com', 'p_bea');
    const changes: [string | undefined, string][] = [];
    s.session.onPersonChanged((from, to) => changes.push([from?.person, to.person]));

    const signIn = createSignIn(deps(s));
    await signIn.sendEmailCode('bea@example.com');
    const person = await signIn.withEmailCode('bea@example.com', '123456');
    expect(person).toEqual({ person: 'p_bea', anonymous: false });
    expect(changes).toEqual([['p_anon1', 'p_bea']]);
    expect(s.session.person()).toEqual({ person: 'p_bea', anonymous: false });
  });

  it('keeps the person when a sign-in fails', async () => {
    const s = start();
    await s.session.ensure();
    s.auth.state.failures.push({ status: 400, code: 'INVALID_OTP' });
    await expect(createSignIn(deps(s)).withEmailCode('bea@example.com', '000000')).rejects.toThrow(
      AuthError,
    );
    expect(s.session.person()).toMatchObject({ person: 'p_anon1' });
  });
});
