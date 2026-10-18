import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  call,
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
    const replay = await signInWithIdToken('apple', identity);
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ code: 'token_reused' });
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
    const body = await response.json<{ nonce: string; expiresAt: number }>();
    expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
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
