import { SignInNonceResponse } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  call,
  freshIp,
  issueNonce,
  readSignIn,
  signInAnonymously,
  signInWithIdToken,
} from './testing/client';
import { startTestIdentityProvider, type TestIdentityProvider } from './testing/identity-provider';

let idp: TestIdentityProvider;

beforeEach(async () => {
  idp = await startTestIdentityProvider();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** When the reservation of an identity token ends (ISO), or null when it has none. */
async function tokenReservation(idToken: string): Promise<string | null> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(idToken));
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  const row = await env.DB.prepare('SELECT expires_at FROM verifications WHERE identifier = ?')
    .bind(`id-token:${hash}`)
    .first<{ expires_at: string }>();
  return row?.expires_at ?? null;
}

function freshSubject(): string {
  return `sub-${crypto.randomUUID()}`;
}

describe('sign-in nonces and replay', () => {
  it('needs a nonce the server issued', async () => {
    const sub = freshSubject();
    const withoutNonce = { idToken: await idp.googleToken(sub) };
    expect((await signInWithIdToken('google', withoutNonce)).status).toBe(401);

    const madeUp = crypto.randomUUID();
    const unissued = { idToken: await idp.googleToken(sub, { nonce: madeUp }), nonce: madeUp };
    expect((await signInWithIdToken('google', unissued)).status).toBe(401);
  });

  it('needs the token to carry the nonce it is sent with', async () => {
    const nonce = await issueNonce();
    const other = await issueNonce();
    const identity = { idToken: await idp.googleToken(freshSubject(), { nonce: other }), nonce };
    expect((await signInWithIdToken('google', identity)).status).toBe(401);
  });

  it('uses each nonce once', async () => {
    const nonce = await issueNonce();
    const first = { idToken: await idp.googleToken(freshSubject(), { nonce }), nonce };
    await readSignIn(await signInWithIdToken('google', first));
    const second = { idToken: await idp.googleToken(freshSubject(), { nonce }), nonce };
    expect((await signInWithIdToken('google', second)).status).toBe(401);
  });

  it('refuses the same identity token a second time', async () => {
    const identity = await idp.sheet('apple', freshSubject());
    await readSignIn(await signInWithIdToken('apple', identity));
    // Even with a fresh nonce, the token itself is spent.
    const replay = await signInWithIdToken('apple', {
      idToken: identity.idToken,
      nonce: await issueNonce(),
    });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ code: 'token_reused' });
  });

  it('spends the nonce before reserving the token, so a bad nonce reserves nothing', async () => {
    const madeUp = crypto.randomUUID();
    const idToken = await idp.googleToken(freshSubject(), { nonce: madeUp });
    const response = await signInWithIdToken('google', { idToken, nonce: madeUp });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'nonce_invalid' });
    expect(await tokenReservation(idToken)).toBeNull();
  });

  it('reserves a token for at most 65 minutes, whatever its expiry claims', async () => {
    const identity = await idp.sheet('google', freshSubject(), { exp: 99_999_999_999 });
    await readSignIn(await signInWithIdToken('google', identity));
    const reservation = await tokenReservation(identity.idToken);
    expect(reservation).not.toBeNull();
    expect(Date.parse(reservation ?? '')).toBeLessThanOrEqual(Date.now() + 65 * 60_000);
  });

  it('refuses an expired nonce', async () => {
    const nonce = await issueNonce();
    await env.DB.prepare(
      "UPDATE verifications SET expires_at = ? WHERE identifier LIKE 'sign-in-nonce:%'",
    )
      .bind(new Date(Date.now() - 1000).toISOString())
      .run();
    const identity = { idToken: await idp.googleToken(freshSubject(), { nonce }), nonce };
    expect((await signInWithIdToken('google', identity)).status).toBe(401);
  });

  it('answers a nonce in the contract shape', async () => {
    const response = await call('/v1/sign-in-nonce', { method: 'POST' });
    expect(response.status).toBe(200);
    const body = SignInNonceResponse.parse(await response.json());
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('handing out nonces', () => {
  it('limits how many nonces one address gets in a minute', async () => {
    const ip = freshIp();
    for (let nonce = 0; nonce < 20; nonce += 1) {
      expect((await call('/v1/sign-in-nonce', { method: 'POST', ip })).status).toBe(200);
    }
    const refused = await call('/v1/sign-in-nonce', { method: 'POST', ip });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: { code: 'rate_limited' } });
    expect((await call('/v1/sign-in-nonce', { method: 'POST', ip: freshIp() })).status).toBe(200);
  });

  it('clears out expired nonces and token reservations as new ones arrive', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    for (const identifier of ['sign-in-nonce:stale', 'id-token:stale']) {
      await env.DB.prepare(
        `INSERT INTO verifications (id, identifier, value, expires_at, created_at, updated_at)
         VALUES (?, ?, '1', ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), identifier, past, past, past)
        .run();
    }
    await issueNonce();
    const identity = await idp.sheet('google', freshSubject());
    await readSignIn(await signInWithIdToken('google', identity));
    const stale = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM verifications WHERE identifier IN ('sign-in-nonce:stale', 'id-token:stale')",
    ).first();
    expect(stale).toEqual({ n: 0 });
  });
});

describe('paths the app never takes', () => {
  it('refuses a social sign-in without an identity token, and every redirect callback', async () => {
    const redirect = await call('/auth/sign-in/social', { body: { provider: 'google' } });
    expect(redirect.status).toBe(400);
    for (const path of ['/auth/callback/apple', '/auth/callback/google']) {
      expect((await call(path)).status).toBe(404);
      expect((await call(path, { body: {} })).status).toBe(404);
    }
  });

  it('turns off the session, token and password endpoints', async () => {
    const { token } = await signInAnonymously();
    for (const path of [
      '/auth/update-session',
      '/auth/get-access-token',
      '/auth/refresh-token',
      '/auth/account-info',
      '/auth/verify-password',
      '/auth/delete-user/callback',
      '/auth/reset-password/some-token',
    ]) {
      const get = await call(path, { token });
      const post = await call(path, { body: {}, token });
      expect([get.status, post.status], path).toEqual([404, 404]);
    }
  });
});
