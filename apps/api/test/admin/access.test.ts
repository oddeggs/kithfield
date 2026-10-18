import { ModeratorSelf } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { call } from '../../src/auth/testing/client';
import { ANA, desk, KOFI, SAM, type TestAccess, useTestAccess } from './support';

let access: TestAccess;
beforeEach(async () => {
  access = await useTestAccess();
});

const asToken = async (token: string | null) => {
  const response = await call('/admin/v1/me', {
    ...(token === null ? {} : { headers: { 'Cf-Access-Jwt-Assertion': token } }),
  });
  return response.status;
};

describe('the safety desk behind Cloudflare Access', () => {
  it('lets in a listed moderator and records them on first sight', async () => {
    const me = await desk(access, ANA, 'GET', '/me');
    expect(me.status).toBe(200);
    expect(ModeratorSelf.parse(me.body)).toEqual({
      moderator: 'ana',
      name: 'ana',
      role: 'senior',
      shiftEndsAt: null,
    });
    const row = await env.DB.prepare('SELECT email, role FROM moderators WHERE id = ?')
      .bind('ana')
      .first();
    expect(row).toEqual({ email: ANA, role: 'senior' });
    const again = await desk(access, KOFI, 'GET', '/me');
    expect(ModeratorSelf.parse(again.body).moderator).toBe('kofi');
  });

  it('refuses requests without a token, or with one Access did not sign for this desk', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await asToken(null)).toBe(401);
    expect(await asToken('not-a-jwt')).toBe(401);
    expect(await asToken(await access.token(ANA, { aud: ['another-application'] }))).toBe(401);
    expect(
      await asToken(await access.token(ANA, { iss: 'https://evil.cloudflareaccess.com' })),
    ).toBe(401);
    expect(await asToken(await access.token(ANA, { exp: now - 3600 }))).toBe(401);
    expect(await asToken(await access.token(ANA, { nbf: now + 3600 }))).toBe(401);
    expect(await asToken(await access.token(ANA, { email: undefined }))).toBe(401);
    expect(await asToken(await access.token(ANA, {}, { alg: 'HS256' }))).toBe(401);
    expect(await asToken(await access.token(ANA, {}, { kid: 'unknown' }))).toBe(401);

    const good = await access.token(ANA);
    const [head, , signature] = good.split('.');
    const forged = `${head}.${btoa(JSON.stringify({ email: ANA })).replace(/=+$/, '')}.${signature}`;
    expect(await asToken(forged)).toBe(401);
  });

  it('answers 403 to someone Access let in who is not a moderator', async () => {
    expect(await asToken(await access.token('someone@example.com'))).toBe(403);
    const none = await env.DB.prepare('SELECT COUNT(*) AS n FROM moderators WHERE email = ?')
      .bind('someone@example.com')
      .first<{ n: number }>();
    expect(none?.n).toBe(0);
  });

  it('caches the certs and fetches them again when Access rotates its key', async () => {
    expect(await asToken(await access.token(ANA))).toBe(200);
    expect(await asToken(await access.token(ANA))).toBe(200);
    expect(access.fetched).toHaveLength(1);
    await access.rotate();
    expect(await asToken(await access.token(ANA))).toBe(200);
    expect(access.fetched).toHaveLength(2);
  });

  it('keeps every admin route behind the check', async () => {
    for (const path of [
      '/queue',
      '/reports/R-1',
      '/members/x',
      '/appeals',
      '/audit',
      '/audit.csv',
      '/response-times',
    ]) {
      expect((await call(`/admin/v1${path}`)).status, path).toBe(401);
    }
    for (const path of ['/reports/R-1/actions', '/actions/A-1/approve', '/appeals/P-1/decision']) {
      expect((await call(`/admin/v1${path}`, { body: {} })).status, path).toBe(401);
    }
  });

  it('takes writes only as JSON, so a cross-site form can never post one', async () => {
    const token = await access.token(ANA);
    const asForm = await call('/admin/v1/actions/A-1/approve', {
      method: 'POST',
      headers: {
        'Cf-Access-Jwt-Assertion': token,
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    expect(asForm.status).toBe(415);
    const bare = await call('/admin/v1/actions/A-1/approve', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': token },
    });
    expect(bare.status).toBe(415);
    const json = await desk(access, ANA, 'POST', '/actions/A-1/approve', {});
    expect(json.status).toBe(404);
  });

  it('reads who moderates, and their role, from the MODERATORS secret', async () => {
    const sam = await desk(access, SAM, 'GET', '/me');
    expect(sam.status).toBe(200);
    expect(ModeratorSelf.parse(sam.body).role).toBe('moderator');
  });
});
