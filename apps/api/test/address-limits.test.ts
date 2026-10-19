import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { call } from '../src/auth/testing/client';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The keys a limiter is asked about, refusing every one. */
const watch = (limiter: RateLimit) => {
  const keys: string[] = [];
  vi.spyOn(limiter, 'limit').mockImplementation(({ key }) => {
    keys.push(key);
    return Promise.resolve({ success: false });
  });
  return keys;
};

describe('limits counted per client address', () => {
  it('count an IPv6 /64 as one address for nonces, deletion codes and desktop codes', async () => {
    const ip = '2001:db8:aa:bb:1234:5678:9abc:def0';
    const nonces = watch(env.SIGN_IN_NONCE_LIMIT);
    expect((await call('/v1/sign-in-nonce', { method: 'POST', ip })).status).toBe(429);
    expect(nonces).toEqual(['2001:db8:aa:bb::/64']);

    const deletions = watch(env.DELETION_REQUEST_LIMIT);
    const asked = await call('/v1/deletion-requests', { body: { email: 'a@example.com' }, ip });
    expect(asked.status).toBe(429);
    expect(deletions).toEqual(['2001:db8:aa:bb::/64']);

    const desktop = watch(env.DESKTOP_LINK_LIMIT);
    const linked = await call('/v1/desktop-link', { body: { name: 'Mac' }, ip });
    expect(linked.status).toBe(429);
    expect(desktop).toEqual(['ask:2001:db8:aa:bb::/64']);
  });

  it('keep an IPv4 address as it is', async () => {
    const nonces = watch(env.SIGN_IN_NONCE_LIMIT);
    await call('/v1/sign-in-nonce', { method: 'POST', ip: '198.51.100.7' });
    expect(nonces).toEqual(['198.51.100.7']);
  });
});
