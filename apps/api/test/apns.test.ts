import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type ApnsConfig,
  apnsConfig,
  d1TokenStore,
  forgetProviderTokens,
  providerToken,
  sendLiveActivity,
} from '../src/push/apns';
import { readRequest, testApnsKey } from './support/apns-key';

const fromUrl = (part: string) =>
  Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));

let key: Awaited<ReturnType<typeof testApnsKey>>;
let config: ApnsConfig;

beforeEach(async () => {
  forgetProviderTokens();
  key = await testApnsKey();
  config = {
    keyP8: key.pem,
    keyId: 'KEY1234567',
    teamId: 'YFND2EEW8S',
    bundleId: 'com.kithfield.app.dev',
    hosts: ['api.push.apple.com', 'api.sandbox.push.apple.com'],
  };
  await env.DB.exec('DELETE FROM apns_tokens');
});

type Sent = { url: string; headers: Record<string, string>; body: unknown };

function fakeApns(answer: (url: string) => Response): { fetch: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    const { url, body } = readRequest(input, init);
    sent.push({ url, headers: init?.headers as Record<string, string>, body });
    return Promise.resolve(answer(url));
  }) as typeof fetch;
  return { fetch: fetcher, sent };
}

describe('the APNs provider token', () => {
  it('is an ES256 JWT for the team and key, verifiable with the key, reused for 50 minutes', async () => {
    const now = Date.UTC(2026, 9, 19, 12);
    const jwt = await providerToken(config, now);
    const [header, claims, signature] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(new TextDecoder().decode(fromUrl(header)))).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    expect(JSON.parse(new TextDecoder().decode(fromUrl(claims)))).toEqual({
      iss: 'YFND2EEW8S',
      iat: now / 1000,
    });
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key.publicKey,
      fromUrl(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
    expect(await providerToken(config, now + 49 * 60_000)).toBe(jwt);
    expect(await providerToken(config, now + 51 * 60_000)).not.toBe(jwt);
  });

  it('is off without the key', () => {
    expect(apnsConfig({ APPLE_BUNDLE_ID: 'x' } as never)).toBeNull();
  });

  it('is made once for every isolate: one kept in D1 is reused until it is 50 minutes old', async () => {
    const store = d1TokenStore(env.DB);
    const now = Date.UTC(2026, 9, 19, 12);
    const first = await providerToken(config, now, store);
    // Another isolate, with nothing in memory, takes the same token.
    forgetProviderTokens();
    expect(await providerToken(config, now + 10 * 60_000, store)).toBe(first);
    forgetProviderTokens();
    const next = await providerToken(config, now + 51 * 60_000, store);
    expect(next).not.toBe(first);
    forgetProviderTokens();
    expect(await providerToken(config, now + 52 * 60_000, store)).toBe(next);
  });

  it('converges when two isolates refresh it at once', async () => {
    const store = d1TokenStore(env.DB);
    const now = Date.UTC(2026, 9, 19, 12);
    const [a, b] = await Promise.all([
      providerToken(config, now, store),
      providerToken(config, now + 1000, store),
    ]);
    forgetProviderTokens();
    const kept = await providerToken(config, now + 2000, store);
    expect([a, b]).toContain(kept);
  });
});

describe('sending a Live Activity push', () => {
  const push = {
    token: 'ab'.repeat(32),
    payload: { aps: { event: 'update' } },
    priority: 5 as const,
  };

  it('posts to the device with the liveactivity type and topic', async () => {
    const apns = fakeApns(() => new Response(null, { status: 200 }));
    expect(await sendLiveActivity(apns.fetch, config, push, 0)).toEqual({ kind: 'ok' });
    expect(apns.sent).toHaveLength(1);
    expect(apns.sent[0]!.url).toBe(`https://api.push.apple.com/3/device/${push.token}`);
    expect(apns.sent[0]!.headers).toMatchObject({
      'apns-push-type': 'liveactivity',
      'apns-topic': 'com.kithfield.app.dev.push-type.liveactivity',
      'apns-priority': '5',
    });
    expect(apns.sent[0]!.headers['authorization']).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(apns.sent[0]!.body).toEqual(push.payload);
  });

  it('tries the sandbox for a development build’s token', async () => {
    const apns = fakeApns((url) =>
      url.includes('sandbox')
        ? new Response(null, { status: 200 })
        : Response.json({ reason: 'BadDeviceToken' }, { status: 400 }),
    );
    expect(await sendLiveActivity(apns.fetch, config, push, 0)).toEqual({ kind: 'ok' });
    expect(apns.sent.map((s) => new URL(s.url).host)).toEqual([
      'api.push.apple.com',
      'api.sandbox.push.apple.com',
    ]);
  });

  it('says a token is dead when Apple no longer takes it', async () => {
    const apns = fakeApns(() => Response.json({ reason: 'Unregistered' }, { status: 410 }));
    expect(
      await sendLiveActivity(apns.fetch, { ...config, hosts: ['api.push.apple.com'] }, push, 0),
    ).toEqual({ kind: 'dead', reason: 'Unregistered' });
  });

  it('sends to the environment’s hosts in order: production only, or the sandbox first', () => {
    const base = { APPLE_BUNDLE_ID: 'com.kithfield.app', APNS_KEY_P8: 'k', APNS_KEY_ID: 'K' };
    expect(apnsConfig({ ...base, APNS_HOST: 'api.push.apple.com' } as never)?.hosts).toEqual([
      'api.push.apple.com',
    ]);
    expect(
      apnsConfig({ ...base, APNS_HOST: 'api.sandbox.push.apple.com,api.push.apple.com' } as never)
        ?.hosts,
    ).toEqual(['api.sandbox.push.apple.com', 'api.push.apple.com']);
  });

  it('keeps its token when Apple says it was refreshed too often, and tries again later', async () => {
    const now = Date.UTC(2026, 9, 19, 12);
    const store = d1TokenStore(env.DB);
    const apns = fakeApns(() =>
      Response.json({ reason: 'TooManyProviderTokenUpdates' }, { status: 429 }),
    );
    const before = await providerToken(config, now, store);
    expect(await sendLiveActivity(apns.fetch, config, push, now, store)).toEqual({
      kind: 'failed',
      reason: 'TooManyProviderTokenUpdates',
    });
    expect(await providerToken(config, now + 60_000, store)).toBe(before);
  });

  it('makes a new token for an expired one, but never within 20 minutes of the last', async () => {
    const now = Date.UTC(2026, 9, 19, 12);
    const store = d1TokenStore(env.DB);
    const apns = fakeApns(() => Response.json({ reason: 'ExpiredProviderToken' }, { status: 403 }));
    const first = await providerToken(config, now, store);
    await sendLiveActivity(apns.fetch, config, push, now + 5 * 60_000, store);
    expect(await providerToken(config, now + 6 * 60_000, store)).toBe(first);
    await sendLiveActivity(apns.fetch, config, push, now + 25 * 60_000, store);
    expect(await providerToken(config, now + 26 * 60_000, store)).not.toBe(first);
  });
});
