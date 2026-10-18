import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { checkAge, minimumAge } from './age';
import { CURRENT_TERMS_VERSION } from './terms';
import { call, sessionOf, signInAnonymously } from './testing/client';

const thisYear = new Date().getUTCFullYear();

describe('checkAge', () => {
  const now = Date.UTC(2026, 9, 18);

  it('lets in only someone certainly old enough, from the birth year alone', () => {
    // Born in 2012: 13 or 14 by the end of 2026, maybe still 13 in October.
    expect(checkAge({ birthYear: 2012, country: 'US', now })).toBe('ok');
    // Born in 2013: 12 or 13, so not certainly 13.
    expect(checkAge({ birthYear: 2013, country: 'US', now })).toBe('under_age');
  });

  it('asks for the local age of digital consent', () => {
    expect(minimumAge('VN')).toBe(16);
    expect(minimumAge('DE')).toBe(16);
    expect(minimumAge('FR')).toBe(15);
    expect(minimumAge('GB')).toBe(13);
    expect(checkAge({ birthYear: 2009, country: 'VN', now })).toBe('ok');
    expect(checkAge({ birthYear: 2010, country: 'VN', now })).toBe('under_age');
    expect(checkAge({ birthYear: 2010, country: 'GB', now })).toBe('ok');
  });

  it('treats a birth year in the future as a mistake', () => {
    expect(checkAge({ birthYear: 2027, country: 'US', now })).toBe('invalid');
  });
});

describe('POST /v1/me/age', () => {
  it('records that the person passed the age check', async () => {
    const { token, user } = await signInAnonymously();
    const response = await call('/v1/me/age', {
      body: { birthYear: thisYear - 30, country: 'VN' },
      token,
    });
    expect(response.status).toBe(204);
    const row = await env.DB.prepare('SELECT age_ok FROM people WHERE id = ?')
      .bind(user.id)
      .first();
    expect(row).toEqual({ age_ok: 1 });
  });

  it('does not create an account for someone under the minimum age', async () => {
    const { token, user } = await signInAnonymously();
    const response = await call('/v1/me/age', {
      body: { birthYear: thisYear - 15, country: 'VN' },
      token,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: 'under_age' } });
    expect(await sessionOf(token)).toBeNull();
    expect(
      await env.DB.prepare('SELECT 1 FROM people WHERE id = ?').bind(user.id).first(),
    ).toBeNull();
  });

  it('keeps an earlier pass', async () => {
    const { token } = await signInAnonymously();
    await call('/v1/me/age', { body: { birthYear: thisYear - 30, country: 'US' }, token });
    const again = await call('/v1/me/age', {
      body: { birthYear: thisYear - 5, country: 'US' },
      token,
    });
    expect(again.status).toBe(204);
    expect(await sessionOf(token)).not.toBeNull();
  });

  it('refuses a malformed answer', async () => {
    const { token } = await signInAnonymously();
    const response = await call('/v1/me/age', { body: { birthYear: 1990, country: 'vn' }, token });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'bad_request', fields: ['country'] } });
    const future = await call('/v1/me/age', {
      body: { birthYear: thisYear + 1, country: 'VN' },
      token,
    });
    expect(await future.json()).toEqual({ error: { code: 'bad_request', fields: ['birthYear'] } });
  });
});

describe('POST /v1/me/terms', () => {
  it('records the Terms version and when it was accepted', async () => {
    const { token, user } = await signInAnonymously();
    const before = Date.now();
    const response = await call('/v1/me/terms', {
      body: { version: CURRENT_TERMS_VERSION },
      token,
    });
    expect(response.status).toBe(204);
    const row = await env.DB.prepare('SELECT terms_version, terms_at FROM people WHERE id = ?')
      .bind(user.id)
      .first<{ terms_version: string; terms_at: number }>();
    expect(row?.terms_version).toBe(CURRENT_TERMS_VERSION);
    expect(row?.terms_at).toBeGreaterThanOrEqual(before);
  });

  it('tells the app which Terms are in force, before and after they are accepted', async () => {
    const { token } = await signInAnonymously();
    const before = await (await call('/v1/me', { token })).json();
    expect(before).toMatchObject({
      termsVersion: null,
      currentTermsVersion: CURRENT_TERMS_VERSION,
    });
    await call('/v1/me/terms', { body: { version: CURRENT_TERMS_VERSION }, token });
    const after = await (await call('/v1/me', { token })).json();
    expect(after).toMatchObject({
      termsVersion: CURRENT_TERMS_VERSION,
      currentTermsVersion: CURRENT_TERMS_VERSION,
    });
  });

  it('accepts only the current Terms', async () => {
    const { token } = await signInAnonymously();
    const response = await call('/v1/me/terms', { body: { version: '2020-01-01' }, token });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'bad_request', fields: ['version'] } });
  });

  it('needs a session', async () => {
    expect((await call('/v1/me/terms', { body: { version: CURRENT_TERMS_VERSION } })).status).toBe(
      401,
    );
  });
});
