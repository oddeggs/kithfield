import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import type { Bindings } from '../src/env';
import { UNCONFIRMED_KEEP_MS, waitlistEmailHash } from '../src/web/waitlist';

const KEY = 'waitlist-test-key-'.padEnd(44, 'x');
const app = createApp();
let client = 0;

/** The API with the waitlist's key set, as `wrangler dev` has it from `.dev.vars`. */
async function call(path: string, init: RequestInit = {}, keyed = true): Promise<Response> {
  const bindings: Bindings = { ...env, ...(keyed ? { WAITLIST_EMAIL_KEY: KEY } : {}) };
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request(`https://dev.kithfield.com/api${path}`, init),
    bindings,
    ctx,
  );
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

interface Row {
  email_hash: string;
  email: string | null;
  lang: string;
  created_at: number;
  confirm_hash: string | null;
  confirmed_at: number | null;
}

function rowFor(email: string): Promise<Row | null> {
  return waitlistEmailHash(KEY, email).then((hash) =>
    env.DB.prepare('SELECT * FROM waitlist WHERE email_hash = ?').bind(hash).first<Row>(),
  );
}

/** Sends a sign-up and returns the confirmation link from the letter. */
async function joinAndReadLink(email: string, lang: 'en' | 'vi' = 'en'): Promise<string> {
  const send = vi.spyOn(env.EMAIL, 'send').mockResolvedValue({ messageId: 'test' });
  expect((await join({ email, lang })).status).toBe(204);
  const letter = send.mock.calls.at(-1)?.[0] as { text: string } | undefined;
  const link = letter?.text.match(/https:\/\/\S+/)?.[0];
  if (!link) throw new Error('No link in the letter');
  return link;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/waitlist', () => {
  it('keeps the address under its keyed hash and sends one letter with a confirmation link', async () => {
    const send = vi.spyOn(env.EMAIL, 'send').mockResolvedValue({ messageId: 'test' });
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
      /https:\/\/dev\.kithfield\.com\/api\/v1\/waitlist\/confirm\/[A-Za-z0-9_-]{43}/,
    );
  });

  it('answers the same for a listed address and sends no second letter so soon', async () => {
    await joinAndReadLink('twice@example.com');
    const send = vi.spyOn(env.EMAIL, 'send').mockResolvedValue({ messageId: 'test' });
    send.mockClear();
    expect((await join({ email: 'twice@example.com', lang: 'en' })).status).toBe(204);
    expect(send).not.toHaveBeenCalled();
  });

  it('turns down a malformed address or language', async () => {
    const bad = await join({ email: 'june', lang: 'fr' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: 'bad_request', fields: ['email', 'lang'] } });
    const notJson = await call('/v1/waitlist', { method: 'POST', body: 'hello' });
    expect(notJson.status).toBe(400);
  });

  it('limits sign-ups from one client address', async () => {
    vi.spyOn(env.EMAIL, 'send').mockResolvedValue({ messageId: 'test' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await join({ email: `limit${i}@example.com`, lang: 'en' }, '10.9.9.9')).status,
      );
    }
    expect(statuses.slice(0, 5)).toEqual([204, 204, 204, 204, 204]);
    expect(statuses[5]).toBe(429);
  });

  it('forgets the address when the letter could not be sent', async () => {
    vi.spyOn(env.EMAIL, 'send').mockRejectedValue(new Error('Email Sending is down'));
    const response = await join({ email: 'nowhere@example.com', lang: 'en' });
    expect(response.status).toBe(503);
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

  it('deletes addresses nobody confirmed within a week', async () => {
    const stale = await waitlistEmailHash(KEY, 'stale@example.com');
    await env.DB.prepare(
      'INSERT INTO waitlist (email_hash, email, lang, created_at, confirm_hash) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(stale, 'stale@example.com', 'en', Date.now() - UNCONFIRMED_KEEP_MS - 1, 'f'.repeat(64))
      .run();
    vi.spyOn(env.EMAIL, 'send').mockResolvedValue({ messageId: 'test' });
    await join({ email: 'fresh@example.com', lang: 'en' });
    expect(await rowFor('stale@example.com')).toBeNull();
  });
});

describe('GET /api/v1/waitlist/confirm/:token', () => {
  it('confirms the address once and sends the browser to the thank-you page', async () => {
    const link = await joinAndReadLink('confirm@example.com', 'vi');
    const path = new URL(link).pathname.replace(/^\/api/, '');

    const first = await call(path);
    expect(first.status).toBe(303);
    expect(first.headers.get('location')).toBe('/vi/waitlist/thanks?confirmed=1');
    const row = await rowFor('confirm@example.com');
    expect(row?.confirmed_at).toEqual(expect.any(Number));
    expect(row?.confirm_hash).toBeNull();

    const again = await call(path);
    expect(again.headers.get('location')).toBe('/waitlist');
  });

  it('sends an unknown or malformed token back to the waitlist', async () => {
    for (const token of ['x'.repeat(43), 'not-a-token']) {
      const response = await call(`/v1/waitlist/confirm/${token}`);
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/waitlist');
    }
  });
});
