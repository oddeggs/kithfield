import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CODE_SENDS_PER_ADDRESS } from './email-code';
import {
  call,
  freshIp,
  readSignIn,
  sendCode,
  sessionOf,
  signInAnonymously,
  signInWithCode,
  watchLetters,
} from './testing/client';

let addressCounter = 0;
function freshAddress(): string {
  addressCounter += 1;
  return `friend${addressCounter}.${crypto.randomUUID().slice(0, 8)}@example.com`;
}

async function personCount(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM people').first<{ n: number }>();
  return row?.n ?? 0;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('email code sign-in', () => {
  it('upgrades the anonymous person in place, keeping their person id', async () => {
    const letters = watchLetters();
    const email = freshAddress();
    const anonymous = await signInAnonymously();
    const people = await personCount();

    expect((await sendCode(email, { token: anonymous.token })).status).toBe(200);
    const response = await signInWithCode(email, letters.codeFor(email), {
      token: anonymous.token,
    });
    const signedIn = await readSignIn(response);

    expect(signedIn.user.id).toBe(anonymous.user.id);
    expect(signedIn.user.isAnonymous).toBe(false);
    expect(signedIn.user.email).toBe(email);
    expect(await personCount()).toBe(people);

    const fresh = await sessionOf(signedIn.token);
    expect(fresh).toMatchObject({ id: anonymous.user.id, isAnonymous: false, email });
    expect(response.headers.get('set-auth-token')).toBeTruthy();
    // The anonymous session still speaks for the same, now signed-in, person.
    expect((await sessionOf(anonymous.token))?.id).toBe(anonymous.user.id);
  });

  it('signs a second device in as the returning person and folds its anonymous person away', async () => {
    const letters = watchLetters();
    const email = freshAddress();
    const first = await signInAnonymously();
    await sendCode(email, { token: first.token });
    await readSignIn(await signInWithCode(email, letters.codeFor(email), { token: first.token }));

    const second = await signInAnonymously();
    await sendCode(email, { token: second.token });
    const signedIn = await readSignIn(
      await signInWithCode(email, letters.codeFor(email), { token: second.token }),
    );

    expect(signedIn.user.id).toBe(first.user.id);
    expect((await sessionOf(signedIn.token))?.id).toBe(first.user.id);
    expect(await sessionOf(second.token)).toBeNull();
    const gone = await env.DB.prepare('SELECT id FROM people WHERE id = ?')
      .bind(second.user.id)
      .first();
    expect(gone).toBeNull();
  });

  it('signs in without an anonymous session too', async () => {
    const letters = watchLetters();
    const email = freshAddress();
    await sendCode(email);
    const signedIn = await readSignIn(await signInWithCode(email, letters.codeFor(email)));
    expect(signedIn.user).toMatchObject({ email, isAnonymous: false });
    expect((await sessionOf(signedIn.token))?.id).toBe(signedIn.user.id);
  });

  it('refuses a wrong code and leaves the person anonymous', async () => {
    const letters = watchLetters();
    const email = freshAddress();
    const anonymous = await signInAnonymously();
    await sendCode(email, { token: anonymous.token });
    const wrong = letters.codeFor(email) === '000000' ? '111111' : '000000';

    const response = await signInWithCode(email, wrong, { token: anonymous.token });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_OTP' });
    expect(await sessionOf(anonymous.token)).toMatchObject({ isAnonymous: true });

    // The right code still works after a wrong one.
    const signedIn = await readSignIn(
      await signInWithCode(email, letters.codeFor(email), { token: anonymous.token }),
    );
    expect(signedIn.user.id).toBe(anonymous.user.id);
  });

  it('spends a code after five wrong guesses', async () => {
    const letters = watchLetters();
    const email = freshAddress();
    await sendCode(email);
    const right = letters.codeFor(email);
    const wrong = right === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await signInWithCode(email, wrong)).status).toBe(400);
    }
    const locked = await signInWithCode(email, right);
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
  });

  it('refuses an expired code', async () => {
    const letters = watchLetters();
    const email = freshAddress();
    await sendCode(email);
    // Ten minutes pass: the stored code's expiry moves into the past.
    await env.DB.prepare('UPDATE verifications SET expires_at = ? WHERE identifier LIKE ?')
      .bind(new Date(Date.now() - 1000).toISOString(), `%${email}%`)
      .run();

    const response = await signInWithCode(email, letters.codeFor(email));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('limits how many codes go to one address, whoever asks', async () => {
    watchLetters();
    const email = freshAddress();
    for (let send = 0; send < CODE_SENDS_PER_ADDRESS; send += 1) {
      expect((await sendCode(email, { ip: freshIp() })).status).toBe(200);
    }
    const refused = await sendCode(email, { ip: freshIp() });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('limits how many codes one device asks for in a minute', async () => {
    watchLetters();
    const ip = freshIp();
    for (let send = 0; send < 3; send += 1) {
      expect((await sendCode(freshAddress(), { ip })).status).toBe(200);
    }
    expect((await sendCode(freshAddress(), { ip })).status).toBe(429);
  });

  it('says so when the letter could not be sent', async () => {
    vi.spyOn(env.EMAIL, 'send').mockRejectedValue(new Error('Email Sending is down'));
    const sends = () =>
      env.DB.prepare('SELECT COUNT(*) AS n FROM email_code_sends').first<{ n: number }>();
    const before = await sends();
    const response = await sendCode(freshAddress());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'unavailable' });
    // A letter that never left doesn't count against the address.
    expect(await sends()).toEqual(before);
  });

  it('sends codes for signing in only', async () => {
    const response = await call('/auth/email-otp/send-verification-otp', {
      body: { email: freshAddress(), type: 'forget-password' },
    });
    expect(response.status).toBe(400);
  });

  it('writes the letter from the one sender, in the language the phone asks for', async () => {
    const email = freshAddress();
    const letters = watchLetters();
    await call('/auth/email-otp/send-verification-otp', {
      body: { email, type: 'sign-in' },
      headers: { 'accept-language': 'vi-VN, en;q=0.8' },
    });
    const letter = letters.sent().at(-1);
    if (letter === undefined) throw new Error('no letter was sent');
    expect(letter.from.email).toBe('hello@kithfield.com');
    expect(letter.to).toBe(email);
    expect(letter.subject).toMatch(/^Mã Kithfield của bạn: \d{6}$/);
    expect(letter.text).toContain('10 phút');
  });
});
