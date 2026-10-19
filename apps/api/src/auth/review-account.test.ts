import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Bindings } from '../env';
import { addressHash, CODE_SENDS_PER_ADDRESS } from './email-code';
import { handleAuthRequest } from './instance';
import { readReviewAccount, reviewCodeFor } from './review-account';
import {
  freshIp,
  readSignIn,
  sendCode,
  sessionOf,
  signInAnonymously,
  signInWithCode,
  watchLetters,
} from './testing/client';

// The test environment's secret (`vitest.config.ts`).
const REVIEW = 'review@kithfield.test';
const COMPANION = 'review.friend@kithfield.test';
const CODE = '274913';

afterEach(() => {
  vi.restoreAllMocks();
});

let counter = 0;
const otherAddress = () => `someone${++counter}.${crypto.randomUUID().slice(0, 8)}@example.com`;

describe('the review account secret', () => {
  it('reads the addresses and the code, and is off when unset or unreadable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const account = readReviewAccount(
      JSON.stringify({ email: ' Review@Example.com ', code: '123456', companion: 'b@example.com' }),
    );
    expect(reviewCodeFor(account, 'review@example.com')).toBe('123456');
    expect(reviewCodeFor(account, 'B@example.com')).toBe('123456');
    expect(reviewCodeFor(account, 'c@example.com')).toBeUndefined();
    expect(readReviewAccount(undefined)).toBeNull();
    expect(readReviewAccount('')).toBeNull();
    expect(readReviewAccount('not json')).toBeNull();
    expect(readReviewAccount(JSON.stringify({ email: 'a@example.com', code: '12345' }))).toBeNull();
    expect(readReviewAccount(JSON.stringify({ email: 'nobody', code: '123456' }))).toBeNull();
    expect(reviewCodeFor(null, 'review@example.com')).toBeUndefined();
  });
});

describe('signing in as App Review', () => {
  it('takes the fixed code for the review address and mails nothing', async () => {
    const letters = watchLetters();
    const ip = freshIp();
    expect((await sendCode(REVIEW, { ip })).status).toBe(200);
    const signedIn = await readSignIn(await signInWithCode(REVIEW, CODE, { ip }));
    expect(signedIn.user).toMatchObject({ email: REVIEW, isAnonymous: false });
    expect(await sessionOf(signedIn.token)).toMatchObject({ id: signedIn.user.id });
    expect(letters.sent()).toEqual([]);
  });

  it('takes the same code for the companion, upgrading an anonymous phone', async () => {
    const letters = watchLetters();
    const anonymous = await signInAnonymously();
    expect((await sendCode(COMPANION, { token: anonymous.token })).status).toBe(200);
    const signedIn = await readSignIn(
      await signInWithCode(COMPANION, CODE, { token: anonymous.token }),
    );
    expect(signedIn.user).toMatchObject({ id: anonymous.user.id, email: COMPANION });
    expect(letters.sent()).toEqual([]);
  });

  it('refuses a wrong code for the review address', async () => {
    expect((await sendCode(REVIEW)).status).toBe(200);
    const wrong = await signInWithCode(REVIEW, '000000');
    expect(wrong.status).toBe(400);
    // The code can't be used without asking for it first, either.
    const fresh = await signInWithCode(REVIEW, CODE);
    expect(fresh.status).toBe(200);
    expect((await signInWithCode(REVIEW, CODE)).status).toBe(400);
  });

  it('counts the review address against the per-address send limit', async () => {
    // Earlier tests in this file already asked for codes in this hour; fill up the rest.
    let status = 200;
    for (let i = 0; i <= CODE_SENDS_PER_ADDRESS && status === 200; i += 1) {
      status = (await sendCode(REVIEW)).status;
    }
    expect(status).toBe(429);
    // Leave the address free for the other files that sign in as App Review.
    await env.DB.prepare('DELETE FROM email_code_sends WHERE address_hash = ?')
      .bind(await addressHash(REVIEW))
      .run();
  });

  it('leaves everyone else on a random, mailed code', async () => {
    const letters = watchLetters();
    const email = otherAddress();
    expect((await sendCode(email)).status).toBe(200);
    const mailed = letters.codeFor(email);
    if (mailed !== CODE) expect((await signInWithCode(email, CODE)).status).toBe(400);
    const signedIn = await readSignIn(await signInWithCode(email, mailed));
    expect(signedIn.user.email).toBe(email);
  });

  it('is off when the secret is unset: the review address is mailed a random code', async () => {
    const letters = watchLetters();
    const { REVIEW_ACCOUNT: _set, ...rest } = env;
    const unset: Bindings = rest;
    const post = (path: string, body: unknown) =>
      handleAuthRequest(
        unset,
        new Request(`https://dev.kithfield.com/api/auth${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': freshIp() },
          body: JSON.stringify(body),
        }),
      );
    const address = 'review.off@kithfield.test';
    expect(
      (await post('/email-otp/send-verification-otp', { email: address, type: 'sign-in' })).status,
    ).toBe(200);
    const mailed = letters.codeFor(address);
    if (mailed !== CODE) {
      expect((await post('/sign-in/email-otp', { email: address, otp: CODE })).status).toBe(400);
    }
    // Off means off for the configured address too.
    const configured = await post('/email-otp/send-verification-otp', {
      email: COMPANION,
      type: 'sign-in',
    });
    expect(configured.status).toBe(200);
    expect(letters.codeFor(COMPANION)).toMatch(/^\d{6}$/);
  });
});
