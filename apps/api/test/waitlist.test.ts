import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import type { Bindings } from '../src/env';
import worker from '../src/index';
import { LETTER_AGAIN_AFTER_MS } from '../src/web/waitlist';
import { UNCONFIRMED_KEEP_MS, clientKey, waitlistEmailHash } from '../src/web/waitlist-store';

const KEY = 'waitlist-test-key-'.padEnd(44, 'x');
const app = createApp();
let client = 0;

/** The API with the waitlist's key set, as `wrangler dev` has it from `.dev.vars`. */
async function call(path: string, init: RequestInit = {}, keyed = true): Promise<Response> {
  // Without the key even when `.dev.vars` sets one, as on a deployment that hasn't set the secret.
  const { WAITLIST_EMAIL_KEY: _unset, ...rest } = env;
  const bindings: Bindings = keyed ? { ...rest, WAITLIST_EMAIL_KEY: KEY } : rest;
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request(`https://dev.kithfield.com/api${path}`, init),
    bindings,
    ctx,
  );
  // The letter goes after the answer; wait for it.
  await waitOnExecutionContext(ctx);
  return response;
}

/** Each sign-up comes from its own client address, so the per-address limit stays out of the way. */
function join(body: unknown, ip = `10.0.0.${++client}`): Promise<Response> {
  return call('/v1/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

function confirm(token: unknown): Promise<Response> {
  return call('/v1/waitlist/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

interface Row {
  email_hash: string;
  email: string | null;
  lang: string;
  created_at: number;
  confirm_hash: string | null;
  confirmed_at: number | null;
  notified_at: number | null;
}

async function rowFor(email: string): Promise<Row | null> {
  const hash = await waitlistEmailHash(KEY, email);
  return env.DB.prepare('SELECT * FROM waitlist WHERE email_hash = ?').bind(hash).first<Row>();
}

async function age(email: string, ms: number): Promise<void> {
  await env.DB.prepare('UPDATE waitlist SET created_at = created_at - ? WHERE email_hash = ?')
    .bind(ms, await waitlistEmailHash(KEY, email))
    .run();
}

function mockLetters() {
  const send = vi.spyOn(env.EMAIL, 'send').mockResolvedValue({ messageId: 'test' });
  send.mockClear();
  return send;
}

/** Sends a sign-up and returns the token from the letter's link. */
async function joinAndReadToken(email: string, lang: 'en' | 'vi' = 'en'): Promise<string> {
  const send = mockLetters();
  expect((await join({ email, lang })).status).toBe(204);
  const letter = send.mock.calls.at(-1)?.[0] as { text: string } | undefined;
  const token = letter?.text.match(/\/waitlist\/confirm#([A-Za-z0-9_-]{43})/)?.[1];
  if (!token) throw new Error('No link in the letter');
  return token;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/waitlist', () => {
  it('keeps the address under its keyed hash and sends one letter linking to the confirm page', async () => {
    const send = mockLetters();
    const response = await join({ email: 'June.M@Example.com', lang: 'vi' });
    expect(response.status).toBe(204);

    const row = await rowFor('june.m@example.com');
    expect(row).toMatchObject({ email: 'june.m@example.com', lang: 'vi', confirmed_at: null });
    expect(row?.email_hash).toMatch(/^[0-9a-f]{64}$/);
    // Keyed: the hash is not the plain SHA-256 of the address.
    const plain = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode('june.m@example.com'),
    );
    const plainHex = Array.from(new Uint8Array(plain), (b) => b.toString(16).padStart(2, '0'));
    expect(row?.email_hash).not.toBe(plainHex.join(''));

    expect(send).toHaveBeenCalledTimes(1);
    const letter = send.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
    expect(letter.to).toBe('june.m@example.com');
    expect(letter.subject).toBe('Xác nhận chỗ của bạn ở cổng Kithfield');
    expect(letter.text).toMatch(
      /https:\/\/dev\.kithfield\.com\/vi\/waitlist\/confirm#[A-Za-z0-9_-]{43}/,
    );
  });

  it('answers the same for a listed address and sends no second letter so soon', async () => {
    await joinAndReadToken('twice@example.com');
    const send = mockLetters();
    expect((await join({ email: 'twice@example.com', lang: 'en' })).status).toBe(204);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a fresh letter after ten minutes, and only the newest link confirms', async () => {
    const first = await joinAndReadToken('again@example.com');
    await age('again@example.com', LETTER_AGAIN_AFTER_MS + 1);
    const second = await joinAndReadToken('again@example.com');
    expect(second).not.toBe(first);
    expect((await confirm(first)).status).toBe(410);
    expect((await confirm(second)).status).toBe(204);
  });

  it('changes nothing for an address that is already confirmed', async () => {
    const token = await joinAndReadToken('settled@example.com');
    expect((await confirm(token)).status).toBe(204);
    const before = await rowFor('settled@example.com');
    await age('settled@example.com', LETTER_AGAIN_AFTER_MS + 1);
    const send = mockLetters();
    expect((await join({ email: 'settled@example.com', lang: 'vi' })).status).toBe(204);
    expect(send).not.toHaveBeenCalled();
    const after = await rowFor('settled@example.com');
    expect(after).toMatchObject({ lang: 'en', confirmed_at: before?.confirmed_at });
  });

  it('turns down a malformed address or language', async () => {
    const bad = await join({ email: 'june', lang: 'fr' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: 'bad_request', fields: ['email', 'lang'] } });
    const notJson = await call('/v1/waitlist', { method: 'POST', body: 'hello' });
    expect(notJson.status).toBe(400);
  });

  it('limits sign-ups from one client address, and from one IPv6 /64', async () => {
    mockLetters();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await join({ email: `limit${i}@example.com`, lang: 'en' }, '10.9.9.9')).status,
      );
    }
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429]);

    const v6: number[] = [];
    for (let i = 0; i < 6; i++) {
      const ip = `2001:db8:abcd:12::${(i + 1).toString(16)}`;
      v6.push((await join({ email: `six${i}@example.com`, lang: 'en' }, ip)).status);
    }
    expect(v6.at(-1)).toBe(429);
  });

  it('forgets the address when the letter could not be sent', async () => {
    vi.spyOn(env.EMAIL, 'send').mockRejectedValue(new Error('Email Sending is down'));
    const response = await join({ email: 'nowhere@example.com', lang: 'en' });
    expect(response.status).toBe(204);
    expect(await rowFor('nowhere@example.com')).toBeNull();
  });

  it('is unavailable until the hashing key is set', async () => {
    const response = await call(
      '/v1/waitlist',
      { method: 'POST', body: JSON.stringify({ email: 'a@example.com', lang: 'en' }) },
      false,
    );
    expect(response.status).toBe(503);
  });
});

describe('POST /api/v1/waitlist/confirm', () => {
  it('confirms the address once', async () => {
    const token = await joinAndReadToken('confirm@example.com', 'vi');
    expect((await confirm(token)).status).toBe(204);
    const row = await rowFor('confirm@example.com');
    expect(row?.confirmed_at).toEqual(expect.any(Number));
    expect(row?.confirm_hash).toBeNull();
    expect((await confirm(token)).status).toBe(410);
  });

  it('turns away a link older than a week', async () => {
    const token = await joinAndReadToken('late@example.com');
    await age('late@example.com', UNCONFIRMED_KEEP_MS + 1);
    expect((await confirm(token)).status).toBe(410);
    expect((await rowFor('late@example.com'))?.confirmed_at).toBeNull();
  });

  it('turns down a malformed token', async () => {
    expect((await confirm('not-a-token')).status).toBe(400);
    expect((await confirm(42)).status).toBe(400);
  });
});

describe('GET /api/v1/waitlist/confirm/:token', () => {
  it('only sends the browser to the confirm page', async () => {
    const token = await joinAndReadToken('get@example.com');
    const response = await call(`/v1/waitlist/confirm/${token}`);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`/waitlist/confirm#${token}`);
    expect((await rowFor('get@example.com'))?.confirmed_at).toBeNull();
    const odd = await call('/v1/waitlist/confirm/not-a-token');
    expect(odd.headers.get('location')).toBe('/waitlist/confirm');
  });
});

describe('the daily retention job', () => {
  it('deletes week-old unconfirmed rows and the addresses the launch letter reached', async () => {
    await joinAndReadToken('stale@example.com');
    await age('stale@example.com', UNCONFIRMED_KEEP_MS + 1);
    const kept = await joinAndReadToken('kept@example.com');
    expect((await confirm(kept)).status).toBe(204);
    await age('kept@example.com', UNCONFIRMED_KEEP_MS * 2);
    const sent = await joinAndReadToken('sent@example.com');
    expect((await confirm(sent)).status).toBe(204);
    await env.DB.prepare('UPDATE waitlist SET notified_at = ? WHERE email_hash = ?')
      .bind(Date.now(), await waitlistEmailHash(KEY, 'sent@example.com'))
      .run();

    const ctx = createExecutionContext();
    worker.scheduled(
      createScheduledController({ scheduledTime: Date.now(), cron: '17 3 * * *' }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(await rowFor('stale@example.com')).toBeNull();
    expect(await rowFor('kept@example.com')).toMatchObject({ email: 'kept@example.com' });
    expect(await rowFor('sent@example.com')).toMatchObject({ email: null });
  });
});

describe('clientKey', () => {
  it('keys IPv4 by address and IPv6 by its /64', () => {
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientKey('2001:db8:abcd:12::1')).toBe('2001:db8:abcd:12::/64');
    expect(clientKey('2001:0db8:abcd:0012:ffff:0:0:9')).toBe('2001:db8:abcd:12::/64');
    expect(clientKey('::1')).toBe('0:0:0:0::/64');
  });
});
