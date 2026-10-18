import { RtTokenResponse } from '@kithfield/contracts';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { RT_TOKEN_LIFETIME_MS, verifyRtToken } from '.';
import { call, signInAnonymously } from './testing/client';

async function issue(token: string, body: { farm?: string }): Promise<RtTokenResponse> {
  const response = await call('/v1/rt-token', { body, token });
  expect(response.status).toBe(200);
  return RtTokenResponse.parse(await response.json());
}

describe('POST /v1/rt-token', () => {
  it('issues a five-minute token for the cottage socket', async () => {
    const { token, user } = await signInAnonymously();
    const before = Date.now();
    const issued = await issue(token, {});

    expect(issued.expiresAt).toBeGreaterThanOrEqual(before + RT_TOKEN_LIFETIME_MS);
    expect(issued.expiresAt).toBeLessThanOrEqual(Date.now() + RT_TOKEN_LIFETIME_MS);
    expect(await verifyRtToken(env, issued.token, { cottage: user.id })).toBe(user.id);
    expect(await verifyRtToken(env, issued.token, { farm: 'farm-1' })).toBeNull();
    expect(await verifyRtToken(env, issued.token, { cottage: 'someone-else' })).toBeNull();
  });

  it('issues a token for one farm socket only', async () => {
    const { token, user } = await signInAnonymously();
    const issued = await issue(token, { farm: 'farm-1' });

    expect(await verifyRtToken(env, issued.token, { farm: 'farm-1' })).toBe(user.id);
    expect(await verifyRtToken(env, issued.token, { farm: 'farm-2' })).toBeNull();
    expect(await verifyRtToken(env, issued.token, { cottage: user.id })).toBeNull();
  });

  it('stops working when it expires', async () => {
    const { token } = await signInAnonymously();
    const issued = await issue(token, { farm: 'farm-1' });
    expect(
      await verifyRtToken(env, issued.token, { farm: 'farm-1' }, issued.expiresAt - 1),
    ).not.toBeNull();
    expect(await verifyRtToken(env, issued.token, { farm: 'farm-1' }, issued.expiresAt)).toBeNull();
  });

  it('refuses a token that was changed, or signed with another secret', async () => {
    const { token } = await signInAnonymously();
    const issued = await issue(token, { farm: 'farm-1' });
    const [version, payload, signature] = issued.token.split('.');
    const otherPayload = btoa(
      JSON.stringify({ p: 'someone-else', f: 'farm-1', e: issued.expiresAt }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(
      await verifyRtToken(env, `${version}.${otherPayload}.${signature}`, { farm: 'farm-1' }),
    ).toBeNull();
    expect(
      await verifyRtToken(env, `${version}.${payload}.${signature}x`, { farm: 'farm-1' }),
    ).toBeNull();
    expect(await verifyRtToken(env, `${version}.${payload}`, { farm: 'farm-1' })).toBeNull();
    expect(await verifyRtToken(env, 42, { farm: 'farm-1' })).toBeNull();
    expect(
      await verifyRtToken(
        { BETTER_AUTH_SECRET: 'another-secret-another-secret-another' },
        issued.token,
        {
          farm: 'farm-1',
        },
      ),
    ).toBeNull();
    expect(await verifyRtToken({}, issued.token, { farm: 'farm-1' })).toBeNull();
  });

  it('needs a session and a valid body', async () => {
    expect((await call('/v1/rt-token', { body: {} })).status).toBe(401);
    const { token } = await signInAnonymously();
    const response = await call('/v1/rt-token', { body: { farm: 'not a farm id!' }, token });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: 'bad_request', fields: ['farm'] } });
  });
});
