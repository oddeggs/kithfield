import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACCOUNT_BAN_SCOPE } from './bans';
import {
  call,
  readSignIn,
  sendCode,
  signInAnonymously,
  signInWithCode,
  watchLetters,
} from './testing/client';

afterEach(() => {
  vi.restoreAllMocks();
});

async function ban(person: string, until: number | null, scope = ACCOUNT_BAN_SCOPE): Promise<void> {
  await env.DB.prepare('INSERT INTO bans (person_id, scope, until, reason) VALUES (?, ?, ?, ?)')
    .bind(person, scope, until, 'harassment')
    .run();
}

describe('bans', () => {
  it('refuses a banned person a socket token', async () => {
    const { token, user } = await signInAnonymously();
    await ban(user.id, null);

    const response = await call('/v1/rt-token', { body: {}, token });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: 'banned' } });
  });

  it('refuses a banned person a new session', async () => {
    const letters = watchLetters();
    const email = `banned.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const phone = await signInAnonymously();
    await sendCode(email, { token: phone.token });
    const person = await readSignIn(
      await signInWithCode(email, letters.codeFor(email), { token: phone.token }),
    );
    await ban(person.user.id, Date.now() + 60_000);

    const laptop = await signInAnonymously();
    await sendCode(email, { token: laptop.token });
    const refused = await signInWithCode(email, letters.codeFor(email), { token: laptop.token });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'banned' });
  });

  it('lets a person back in once their ban has ended', async () => {
    const { token, user } = await signInAnonymously();
    await ban(user.id, Date.now() - 1);
    expect((await call('/v1/rt-token', { body: {}, token })).status).toBe(200);
  });

  it('reads only account bans', async () => {
    const { token, user } = await signInAnonymously();
    await ban(user.id, null, 'farm');
    expect((await call('/v1/rt-token', { body: {}, token })).status).toBe(200);
  });
});
