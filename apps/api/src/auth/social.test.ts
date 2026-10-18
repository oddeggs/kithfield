import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  issueNonce,
  readSignIn,
  sendCode,
  sessionOf,
  signInAnonymously,
  signInWithCode,
  signInWithIdToken,
  watchLetters,
} from './testing/client';
import {
  DEV_APPLE_AUDIENCE,
  DEV_GOOGLE_WEB_AUDIENCE,
  startTestIdentityProvider,
  type TestIdentityProvider,
} from './testing/identity-provider';

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

async function accountsOf(person: string) {
  const { results } = await env.DB.prepare(
    'SELECT provider_id, account_id FROM accounts WHERE person_id = ? ORDER BY provider_id',
  )
    .bind(person)
    .all<{ provider_id: string; account_id: string }>();
  return results;
}

async function personExists(person: string): Promise<boolean> {
  return (await env.DB.prepare('SELECT 1 FROM people WHERE id = ?').bind(person).first()) !== null;
}

async function sessionCount(person: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE person_id = ?')
    .bind(person)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Someone who signed in with an email code, so their verified email is on file. */
async function personWithEmail(email: string) {
  const letters = watchLetters();
  await sendCode(email);
  return readSignIn(await signInWithCode(email, letters.codeFor(email)));
}

describe.each(['apple', 'google'] as const)('signing in with %s', (provider) => {
  it('upgrades the anonymous person in place, keeping their person id', async () => {
    const anonymous = await signInAnonymously();
    const sub = freshSubject();

    const signedIn = await readSignIn(
      await signInWithIdToken(provider, await idp.sheet(provider, sub), anonymous.token),
    );

    expect(signedIn.user.id).toBe(anonymous.user.id);
    expect(signedIn.user.isAnonymous).toBe(false);
    expect(await sessionOf(signedIn.token)).toMatchObject({
      id: anonymous.user.id,
      isAnonymous: false,
      emailVerified: true,
    });
    // The anonymous session ends; the app carries on with the one it was just given.
    expect(await sessionOf(anonymous.token)).toBeNull();
    expect(await accountsOf(anonymous.user.id)).toEqual([
      { provider_id: provider, account_id: sub },
    ]);
  });

  it('signs a second device in as the returning person and folds its anonymous person away', async () => {
    const sub = freshSubject();
    const first = await signInAnonymously();
    await readSignIn(
      await signInWithIdToken(provider, await idp.sheet(provider, sub), first.token),
    );

    const second = await signInAnonymously();
    const signedIn = await readSignIn(
      await signInWithIdToken(provider, await idp.sheet(provider, sub), second.token),
    );

    expect(signedIn.user.id).toBe(first.user.id);
    expect((await sessionOf(signedIn.token))?.id).toBe(first.user.id);
    expect(await sessionOf(second.token)).toBeNull();
    expect(await personExists(second.user.id)).toBe(false);
    expect(await accountsOf(first.user.id)).toHaveLength(1);
  });

  it('refuses a token signed by a key the provider never published', async () => {
    const anonymous = await signInAnonymously();
    const nonce = await issueNonce();
    const forged = await idp.forgedToken({
      iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
      aud: provider === 'apple' ? DEV_APPLE_AUDIENCE : DEV_GOOGLE_WEB_AUDIENCE,
      sub: freshSubject(),
      email: 'forger@example.com',
      email_verified: true,
      nonce,
    });
    const response = await signInWithIdToken(provider, { idToken: forged, nonce }, anonymous.token);
    expect(response.status).toBe(401);
    expect(await sessionOf(anonymous.token)).toMatchObject({ isAnonymous: true });
  });

  it('refuses a token for another app, from another issuer, or past its expiry', async () => {
    const refused = [
      { aud: 'com.example.someone-else' },
      { iss: 'https://issuer.example' },
      { exp: Math.floor(Date.now() / 1000) - 60 },
    ];
    for (const claims of refused) {
      const identity = await idp.sheet(provider, freshSubject(), claims);
      expect((await signInWithIdToken(provider, identity)).status).toBe(401);
    }
  });
});

describe('identity tokens per environment', () => {
  it('accepts Google tokens issued to the web client as well as the iOS one', async () => {
    const signedIn = await readSignIn(
      await signInWithIdToken(
        'google',
        await idp.sheet('google', freshSubject(), { aud: DEV_GOOGLE_WEB_AUDIENCE }),
      ),
    );
    expect(signedIn.user.isAnonymous).toBe(false);
  });

  it('refuses an Apple token for the production app in the dev environment', async () => {
    const identity = await idp.sheet('apple', freshSubject(), { aud: 'com.kithfield.app' });
    expect((await signInWithIdToken('apple', identity)).status).toBe(401);
  });

  it('accepts an Apple private relay address as the verified email Apple says it is', async () => {
    const sub = freshSubject();
    const signedIn = await readSignIn(
      await signInWithIdToken('apple', await idp.sheet('apple', sub)),
    );
    expect(signedIn.user.email).toBe(`${sub}@privaterelay.appleid.com`);
    expect(signedIn.user.emailVerified).toBe(true);
  });
});

describe('an email the provider has not verified', () => {
  it('never reaches the person who owns that email, nor gets a session', async () => {
    const email = `victim.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const victim = await personWithEmail(email);
    const victimSessions = await sessionCount(victim.user.id);
    const attacker = await signInAnonymously();

    for (const bearer of [undefined, attacker.token]) {
      const identity = await idp.sheet('google', freshSubject(), { email, email_verified: false });
      const response = await signInWithIdToken('google', identity, bearer);
      expect(response.status).toBe(401);
      expect(response.headers.get('set-auth-token')).toBeNull();
    }

    expect(await sessionCount(victim.user.id)).toBe(victimSessions);
    expect(await accountsOf(victim.user.id)).toEqual([
      { provider_id: 'email-otp', account_id: email },
    ]);
    expect(await sessionOf(attacker.token)).toMatchObject({
      id: attacker.user.id,
      isAnonymous: true,
    });
  });

  it('creates nobody for an unverified email that matches no one', async () => {
    const email = `nobody.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const identity = await idp.sheet('google', freshSubject(), { email, email_verified: false });
    expect((await signInWithIdToken('google', identity)).status).toBe(401);
    const row = await env.DB.prepare('SELECT 1 FROM people WHERE email = ?').bind(email).first();
    expect(row).toBeNull();
  });
});

describe('one person across sign-in methods', () => {
  it('finds the same person by a verified email, whichever method signs in', async () => {
    const letters = watchLetters();
    const email = `same.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const phone = await signInAnonymously();
    await sendCode(email, { token: phone.token });
    const byCode = await readSignIn(
      await signInWithCode(email, letters.codeFor(email), { token: phone.token }),
    );

    const laptop = await signInAnonymously();
    const byGoogle = await readSignIn(
      await signInWithIdToken(
        'google',
        await idp.sheet('google', freshSubject(), { email }),
        laptop.token,
      ),
    );

    expect(byGoogle.user.id).toBe(byCode.user.id);
    expect(byGoogle.user.id).toBe(phone.user.id);
    expect(await personExists(laptop.user.id)).toBe(false);
  });
});

describe('an upgrade racing another', () => {
  it('gives the anonymous person one identity, never two', async () => {
    const anonymous = await signInAnonymously();
    const sheets = await Promise.all([
      idp.sheet('google', freshSubject()),
      idp.sheet('apple', freshSubject()),
    ]);
    const responses = await Promise.all([
      signInWithIdToken('google', sheets[0], anonymous.token),
      signInWithIdToken('apple', sheets[1], anonymous.token),
    ]);
    expect(await accountsOf(anonymous.user.id)).toHaveLength(1);
    for (const response of responses) expect([200, 409]).toContain(response.status);
  });
});

describe('the returning person keeps what they have', () => {
  it('takes only the age check and a later Terms acceptance from the anonymous person', async () => {
    const sub = freshSubject();
    const first = await signInAnonymously();
    await readSignIn(await signInWithIdToken('apple', await idp.sheet('apple', sub), first.token));
    await env.DB.prepare(
      "UPDATE people SET terms_version = '2026-01-01', terms_at = 1, display_name = 'Pip' WHERE id = ?",
    )
      .bind(first.user.id)
      .run();

    const second = await signInAnonymously();
    await env.DB.prepare(
      "UPDATE people SET age_ok = 1, terms_version = '2026-10-01', terms_at = 2, display_name = 'Bea' WHERE id = ?",
    )
      .bind(second.user.id)
      .run();
    await readSignIn(await signInWithIdToken('apple', await idp.sheet('apple', sub), second.token));

    const merged = await env.DB.prepare(
      'SELECT age_ok, terms_version, terms_at, display_name FROM people WHERE id = ?',
    )
      .bind(first.user.id)
      .first();
    expect(merged).toEqual({
      age_ok: 1,
      terms_version: '2026-10-01',
      terms_at: 2,
      display_name: 'Pip',
    });
  });
});
