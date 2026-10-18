import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { call, sessionOf, signInAnonymously } from './testing/client';

describe('anonymous sign-in', () => {
  it('gives a new install an anonymous person with a bearer session', async () => {
    const { token, user } = await signInAnonymously();
    expect(user.isAnonymous).toBe(true);
    expect(user.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);

    const session = await sessionOf(token);
    expect(session?.id).toBe(user.id);
    expect(session?.isAnonymous).toBe(true);

    const row = await env.DB.prepare('SELECT is_anonymous, age_ok FROM people WHERE id = ?')
      .bind(user.id)
      .first();
    expect(row).toEqual({ is_anonymous: 1, age_ok: null });
  });

  it('refuses a second anonymous sign-in from an anonymous session', async () => {
    const { token } = await signInAnonymously();
    const again = await call('/auth/sign-in/anonymous', { body: {}, token });
    expect(again.status).toBe(400);
  });

  it('answers no session for a missing or unknown token', async () => {
    expect(await sessionOf('not-a-session')).toBeNull();
    const response = await call('/v1/rt-token', { body: {} });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized' } });
  });

  it('signs out by deleting the session', async () => {
    const { token } = await signInAnonymously();
    const out = await call('/auth/sign-out', { body: {}, token });
    expect(out.status).toBe(200);
    expect(await sessionOf(token)).toBeNull();
  });
});
