import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ACCOUNT_BAN_SCOPE, banPerson } from './bans';
import { CURRENT_TERMS_VERSION } from './terms';
import {
  call,
  readSignIn,
  sessionOf,
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

  it('refuses a banned person on a session they already hold', async () => {
    const { token, user } = await signInAnonymously();
    await ban(user.id, null);
    const response = await call('/v1/me/terms', {
      body: { version: CURRENT_TERMS_VERSION },
      token,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: 'banned' } });
  });

  it('ends every session of the person moderation bans', async () => {
    const phone = await signInAnonymously();
    await banPerson(env.DB, {
      person: phone.user.id,
      scope: ACCOUNT_BAN_SCOPE,
      until: null,
      reason: 'harassment',
    });
    expect(await sessionOf(phone.token)).toBeNull();
    const row = await env.DB.prepare('SELECT scope, until FROM bans WHERE person_id = ?')
      .bind(phone.user.id)
      .first();
    expect(row).toEqual({ scope: ACCOUNT_BAN_SCOPE, until: null });
  });

  it('refuses a banned anonymous person who signs in as someone returning', async () => {
    const letters = watchLetters();
    const email = `returning.${crypto.randomUUID().slice(0, 8)}@example.com`;
    await sendCode(email);
    const person = await readSignIn(await signInWithCode(email, letters.codeFor(email)));

    const laptop = await signInAnonymously();
    await ban(laptop.user.id, null);
    await sendCode(email, { token: laptop.token });
    const refused = await signInWithCode(email, letters.codeFor(email), { token: laptop.token });
    expect(refused.status).toBe(403);
    expect(refused.headers.get('set-auth-token')).toBeNull();
    const sessions = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE person_id = ?')
      .bind(person.user.id)
      .first();
    expect(sessions).toEqual({ n: 1 });
    expect(
      await env.DB.prepare('SELECT 1 AS here FROM people WHERE id = ?')
        .bind(laptop.user.id)
        .first(),
    ).toEqual({ here: 1 });
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

  it("stops a banned person's device action keys: a ban row refuses them, banning deletes them", async () => {
    const { token, user } = await signInAnonymously();
    const device = { platform: 'ios', name: 'Phone', pushToken: null, appVersion: '1.0.0' };
    const registered = await call(`/v1/devices/${crypto.randomUUID()}`, {
      method: 'PUT',
      body: device,
      token,
    });
    const { actionKey } = await registered.json<{ actionKey: string }>();
    const withKey = () =>
      call('/v1/media/upload-url', {
        body: {},
        headers: { 'Kithfield-Action-Key': actionKey },
      });
    expect((await withKey()).status).not.toBe(401);

    await ban(user.id, null);
    const refused = await withKey();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: { code: 'banned' } });

    await banPerson(env.DB, {
      person: user.id,
      scope: ACCOUNT_BAN_SCOPE,
      until: null,
      reason: 'x',
    });
    const keys = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM device_action_keys WHERE person_id = ?',
    )
      .bind(user.id)
      .first<{ n: number }>();
    expect(keys?.n).toBe(0);
  });
});
