import { describe, expect, it } from '@jest/globals';

import { createApiClient } from './api-client';
import {
  BEARER_KEY,
  bearerFetchOptions,
  createSession,
  type AuthPort,
  type SessionStorage,
} from './session';

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

/*
 * A stand-in for the Better Auth server behind the client (it is being built alongside): it
 * answers sessions by bearer token and makes anonymous people, handing the token back in
 * `set-auth-token` the way the bearer plugin does. The bearer fetch options run on its answers.
 */
function fakeAuth(storage: SessionStorage) {
  const sessions = new Map<string, { id: string; isAnonymous: boolean }>();
  const state = { online: true, signIns: 0 };
  const options = bearerFetchOptions(storage);

  const call = async <T>(answer: () => { body: T; headers?: Record<string, string> }) => {
    await Promise.resolve();
    if (!state.online) throw new TypeError('Network request failed');
    const { body, headers } = answer();
    await options.onSuccess({
      response: new Response(JSON.stringify(body), headers ? { headers } : {}),
    });
    return body;
  };
  const user = () => sessions.get(options.auth.token() ?? '') ?? null;

  const port: AuthPort = {
    getSession: () => call(() => ({ body: { data: user() ? { user: user()! } : null } })),
    signInAnonymous: () =>
      call(() => {
        state.signIns += 1;
        const created = { id: `p_anon${state.signIns}`, isAnonymous: true };
        const token = `tok_${state.signIns}_${'z'.repeat(24)}`;
        sessions.set(token, created);
        return { body: { data: { user: created } }, headers: { 'set-auth-token': token } };
      }),
    getCookie: () => Promise.resolve(''),
    signOut: () => Promise.resolve(),
  };
  return { port, state, sessions };
}

describe('the session', () => {
  it('starts anonymous on first launch and keeps the bearer in the Keychain', async () => {
    const storage = memoryStorage();
    const auth = fakeAuth(storage);
    const session = createSession(auth.port, storage);

    expect(await session.ensure()).toEqual({ person: 'p_anon1', anonymous: true });
    const token = `tok_1_${'z'.repeat(24)}`;
    expect(storage.values.get(BEARER_KEY)).toBe(token);
    expect(await session.headers()).toEqual({ authorization: `Bearer ${token}` });

    // The API calls carry it.
    const seen: string[] = [];
    const api = createApiClient({
      baseUrl: 'https://test.kithfield.invalid/api',
      fetch: (_input, init) => {
        seen.push(new Headers(init?.headers).get('authorization') ?? '');
        const body = JSON.stringify({ token: 'rt_'.padEnd(20, 'x'), expiresAt: 1 });
        return Promise.resolve(new Response(body, { status: 200 }));
      },
      authHeaders: () => session.headers(),
    });
    await api.rtToken('f_lot');
    expect(seen).toEqual([`Bearer ${token}`]);
  });

  it('reuses the stored session on the next launch instead of making a new person', async () => {
    const storage = memoryStorage();
    const auth = fakeAuth(storage);
    await createSession(auth.port, storage).ensure();
    expect(await createSession(auth.port, storage).ensure()).toEqual({
      person: 'p_anon1',
      anonymous: true,
    });
    expect(auth.state.signIns).toBe(1);
  });

  it('opens offline as the person it last was, and can’t start offline on a first launch', async () => {
    const storage = memoryStorage();
    const auth = fakeAuth(storage);
    await createSession(auth.port, storage).ensure();
    auth.state.online = false;
    expect(await createSession(auth.port, storage).ensure()).toEqual({
      person: 'p_anon1',
      anonymous: true,
    });

    const fresh = memoryStorage();
    const offline = fakeAuth(fresh);
    offline.state.online = false;
    const session = createSession(offline.port, fresh);
    await expect(session.ensure()).rejects.toThrow('Network request failed');
    expect(session.person()).toBeNull();
  });

  it('forgets the person and the bearer on sign-out', async () => {
    const storage = memoryStorage();
    const session = createSession(fakeAuth(storage).port, storage);
    await session.ensure();
    await session.signOut();
    expect(session.person()).toBeNull();
    expect(await session.headers()).toEqual({});
  });
});
