import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

import type { Bindings } from '../env';
import { appleFetch, appleTokenRoutes, clientSecret } from './apple-tokens';
import { appleRevocation } from './purge';
import { signInAnonymously } from './testing/client';

const real = appleFetch.current;
afterEach(() => {
  appleFetch.current = real;
});

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const fromUrl = (part: string) =>
  Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** A Sign in with Apple key, as the founder would paste its `.p8`. */
async function appleKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const body = btoa(String.fromCharCode(...pkcs8));
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`, pair };
}

const idTokenFor = (sub: string) =>
  `e30.${base64url(new TextEncoder().encode(JSON.stringify({ sub })))}.sig`;

/** Apple, as the tests stand in for it: what was asked, and the answer to each path. */
function apple(answers: Record<string, () => Response>) {
  const asked: { path: string; form: URLSearchParams }[] = [];
  appleFetch.current = ((input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    const body = typeof init?.body === 'string' ? init.body : '';
    asked.push({ path, form: new URLSearchParams(body) });
    const answer = answers[path];
    return Promise.resolve(answer ? answer() : new Response(null, { status: 404 }));
  }) as unknown as typeof fetch;
  return asked;
}

async function appleSignedIn(sub: string) {
  const person = await signInAnonymously();
  await env.DB.prepare(
    `INSERT INTO accounts (id, account_id, provider_id, person_id, created_at, updated_at)
     VALUES (?, ?, 'apple', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      sub,
      person.user.id,
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run();
  return person;
}

const refreshOf = async (person: string) =>
  (
    await env.DB.prepare(
      "SELECT refresh_token FROM accounts WHERE person_id = ? AND provider_id = 'apple'",
    )
      .bind(person)
      .first<{ refresh_token: string | null }>()
  )?.refresh_token ?? null;

const post = (keyed: Bindings, token: string, body: unknown) =>
  appleTokenRoutes().request(
    '/v1/me/apple-authorization',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    keyed,
  );

describe('Sign in with Apple tokens', () => {
  it('signs a short client secret Apple can check with the key', async () => {
    const { pem, pair } = await appleKey();
    const key = { keyP8: pem, keyId: 'KEY1', teamId: 'TEAM1', clientId: 'com.kithfield.app' };
    const jwt = await clientSecret(key, Date.UTC(2026, 9, 19));
    const [header = '', claims = '', signature = ''] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromUrl(header)))).toEqual({
      alg: 'ES256',
      kid: 'KEY1',
    });
    const iat = Date.UTC(2026, 9, 19) / 1000;
    expect(JSON.parse(new TextDecoder().decode(fromUrl(claims)))).toEqual({
      iss: 'TEAM1',
      iat,
      exp: iat + 300,
      aud: 'https://appleid.apple.com',
      sub: 'com.kithfield.app',
    });
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      fromUrl(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it('accepts and drops a code while no key is set', async () => {
    const asked = apple({});
    const person = await appleSignedIn(`apple.${crypto.randomUUID()}`);
    expect((await post(env, person.token, { code: 'c1' })).status).toBe(204);
    expect(asked).toEqual([]);
    expect(await refreshOf(person.user.id)).toBeNull();
  });

  it("keeps the refresh token on the person's own Apple identity, and revokes it at the purge", async () => {
    const { pem } = await appleKey();
    const keyed = { ...env, APPLE_SIGN_IN_KEY_P8: pem, APPLE_SIGN_IN_KEY_ID: 'KEY1' };
    const sub = `apple.${crypto.randomUUID()}`;
    const person = await appleSignedIn(sub);
    const asked = apple({
      '/auth/token': () => Response.json({ refresh_token: 'r-1', id_token: idTokenFor(sub) }),
      '/auth/revoke': () => new Response(null, { status: 200 }),
    });
    expect((await post(keyed, person.token, { code: 'c1' })).status).toBe(204);
    expect(asked[0]?.path).toBe('/auth/token');
    expect(Object.fromEntries(asked[0]?.form ?? [])).toMatchObject({
      client_id: env.APPLE_BUNDLE_ID,
      code: 'c1',
      grant_type: 'authorization_code',
    });
    expect(await refreshOf(person.user.id)).toBe('r-1');

    await appleRevocation.current.revoke(keyed, { person: person.user.id, appleAccounts: [sub] });
    expect(asked.at(-1)?.path).toBe('/auth/revoke');
    expect(Object.fromEntries(asked.at(-1)?.form ?? [])).toMatchObject({
      token: 'r-1',
      token_type_hint: 'refresh_token',
    });
  });

  it("refuses a code for someone else's Apple identity, and hands that token back", async () => {
    const { pem } = await appleKey();
    const keyed = { ...env, APPLE_SIGN_IN_KEY_P8: pem, APPLE_SIGN_IN_KEY_ID: 'KEY1' };
    const person = await appleSignedIn(`apple.${crypto.randomUUID()}`);
    const asked = apple({
      '/auth/token': () => Response.json({ refresh_token: 'r-2', id_token: idTokenFor('other') }),
      '/auth/revoke': () => new Response(null, { status: 200 }),
    });
    expect((await post(keyed, person.token, { code: 'c2' })).status).toBe(403);
    expect(await refreshOf(person.user.id)).toBeNull();
    expect(asked.map((a) => a.path)).toEqual(['/auth/token', '/auth/revoke']);
  });

  it('fails the purge step when Apple will not revoke, so it is tried again', async () => {
    const { pem } = await appleKey();
    const keyed = { ...env, APPLE_SIGN_IN_KEY_P8: pem, APPLE_SIGN_IN_KEY_ID: 'KEY1' };
    const sub = `apple.${crypto.randomUUID()}`;
    const person = await appleSignedIn(sub);
    await env.DB.prepare("UPDATE accounts SET refresh_token = 'r-3' WHERE person_id = ?")
      .bind(person.user.id)
      .run();
    apple({ '/auth/revoke': () => new Response(null, { status: 503 }) });
    await expect(
      appleRevocation.current.revoke(keyed, { person: person.user.id, appleAccounts: [sub] }),
    ).rejects.toThrow('503');
  });

  it('lets the purge go on when Apple refuses the key, which no retry would mend', async () => {
    const { pem } = await appleKey();
    const keyed = { ...env, APPLE_SIGN_IN_KEY_P8: pem, APPLE_SIGN_IN_KEY_ID: 'KEY1' };
    const sub = `apple.${crypto.randomUUID()}`;
    const person = await appleSignedIn(sub);
    await env.DB.prepare("UPDATE accounts SET refresh_token = 'r-4' WHERE person_id = ?")
      .bind(person.user.id)
      .run();
    apple({ '/auth/revoke': () => Response.json({ error: 'invalid_client' }, { status: 400 }) });
    await expect(
      appleRevocation.current.revoke(keyed, { person: person.user.id, appleAccounts: [sub] }),
    ).resolves.toBeUndefined();
  });
});
