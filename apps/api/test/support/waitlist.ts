import { WaitlistResponse } from '@kithfield/contracts';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { expect, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { Bindings } from '../../src/env';
import { waitlistEmailHash } from '../../src/web/waitlist-store';

/* The waitlist tests' calls and reads, shared by the sign-up and pick tests. */

export const KEY = 'waitlist-test-key-'.padEnd(44, 'x');
const app = createApp();
let client = 0;

/** The API with the waitlist's key set, as `wrangler dev` has it from `.dev.vars`. */
export async function call(path: string, init: RequestInit = {}, keyed = true): Promise<Response> {
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
export function join(body: unknown, ip = `10.0.0.${++client}`): Promise<Response> {
  return call('/v1/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

/** The answer every sign-up gets: 200 with a pick, whatever the address. */
export async function pickFrom(response: Response): Promise<string> {
  expect(response.status).toBe(200);
  return WaitlistResponse.parse(await response.json()).pick;
}

export function savePick(pick: unknown, species: unknown = 'fox'): Promise<Response> {
  return call('/v1/waitlist/pick', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pick, species }),
  });
}

export function confirm(token: unknown): Promise<Response> {
  return call('/v1/waitlist/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

export interface Row {
  email_hash: string;
  email: string | null;
  lang: string;
  created_at: number;
  confirm_hash: string | null;
  confirmed_at: number | null;
  notified_at: number | null;
  platform: string | null;
  species: string | null;
}

export async function rowFor(email: string): Promise<Row | null> {
  const hash = await waitlistEmailHash(KEY, email);
  return env.DB.prepare('SELECT * FROM waitlist WHERE email_hash = ?').bind(hash).first<Row>();
}

export async function age(email: string, ms: number): Promise<void> {
  await env.DB.prepare('UPDATE waitlist SET created_at = created_at - ? WHERE email_hash = ?')
    .bind(ms, await waitlistEmailHash(KEY, email))
    .run();
}

export function mockLetters() {
  const send = vi.spyOn(env.EMAIL, 'send').mockResolvedValue({ messageId: 'test' });
  send.mockClear();
  return send;
}

/** Sends a sign-up and returns the token from the letter's link. */
export async function joinAndReadToken(email: string, lang: 'en' | 'vi' = 'en'): Promise<string> {
  return (await joinWithPick(email, lang)).token;
}

/** Sends a sign-up and returns its pick and the token from the letter's link. */
export async function joinWithPick(
  email: string,
  lang: 'en' | 'vi' = 'en',
): Promise<{ pick: string; token: string }> {
  const send = mockLetters();
  const pick = await pickFrom(await join({ email, lang }));
  const letter = send.mock.calls.at(-1)?.[0] as { text: string } | undefined;
  const token = letter?.text.match(/\/waitlist\/confirm#([A-Za-z0-9_-]{43})/)?.[1];
  if (!token) throw new Error('No link in the letter');
  return { pick, token };
}
