import { env, exports } from 'cloudflare:workers';
import { expect, vi } from 'vitest';

/** Requests to the Worker as the app makes them: JSON bodies and a bearer session token. */

const ORIGIN = 'https://dev.kithfield.com';
let addressCounter = 0;

export interface CallOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly token?: string;
  /** Requests from one device share an address, so Better Auth's per-address limits apply. */
  readonly ip?: string;
  readonly headers?: Record<string, string>;
}

/** A distinct client address per call site, so one test's requests never limit another's. */
export function freshIp(): string {
  addressCounter += 1;
  return `10.0.${Math.floor(addressCounter / 250)}.${addressCounter % 250}`;
}

export function call(path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('cf-connecting-ip', options.ip ?? freshIp());
  if (options.token !== undefined) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return exports.default.fetch(`${ORIGIN}/api${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly isAnonymous: boolean | null;
}

export interface SignedIn {
  readonly token: string;
  readonly user: SessionUser;
}

async function expectJson<T>(response: Response, status = 200): Promise<T> {
  const text = await response.text();
  expect(response.status, text).toBe(status);
  return JSON.parse(text) as T;
}

/** A new install: an anonymous person and their session. */
export async function signInAnonymously(ip?: string): Promise<SignedIn> {
  const response = await call('/auth/sign-in/anonymous', { body: {}, ...(ip ? { ip } : {}) });
  return expectJson<SignedIn>(response);
}

/** The person a token signs in as now, read fresh from `/get-session`. */
export async function sessionOf(token: string): Promise<SessionUser | null> {
  const response = await call('/auth/get-session', { token });
  const body = await expectJson<{ user: SessionUser } | null>(response);
  return body?.user ?? null;
}

/** What the phone's Apple or Google sheet hands back: the identity token and the raw nonce. */
export interface IdentityFromSheet {
  readonly idToken: string;
  readonly nonce?: string;
}

export async function signInWithIdToken(
  provider: 'apple' | 'google',
  identity: IdentityFromSheet,
  token?: string,
): Promise<Response> {
  return call('/auth/sign-in/social', {
    body: {
      provider,
      idToken: {
        token: identity.idToken,
        ...(identity.nonce === undefined ? {} : { nonce: identity.nonce }),
      },
    },
    ...(token ? { token } : {}),
  });
}

/** A single-use sign-in nonce from the server, for the next Apple or Google sheet. */
export async function issueNonce(): Promise<string> {
  const response = await call('/v1/sign-in-nonce', { method: 'POST' });
  const body = await expectJson<{ nonce: string }>(response);
  return body.nonce;
}

export async function readSignIn(response: Response): Promise<SignedIn> {
  return expectJson<SignedIn>(response);
}

/** A letter as the code sender hands it to the `EMAIL` binding. */
export interface SentLetter {
  readonly from: { readonly name: string; readonly email: string };
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Watches the `EMAIL` binding: what was sent, with the code read from each letter. Every letter
 * still goes to the simulated binding, which checks it (the allowed sender, among others).
 */
export function watchLetters(): {
  readonly sent: () => readonly SentLetter[];
  readonly codeFor: (address: string) => string;
} {
  // Called unbound on purpose: a binding's methods are RPC stubs, and a spy calling through with
  // `apply` would send "apply" to the binding as a method name.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const deliver = env.EMAIL.send;
  const spy = vi
    .spyOn(env.EMAIL, 'send')
    .mockImplementation((letter: EmailMessageBuilder) => deliver(letter));
  const sent = () => spy.mock.calls.map(([letter]) => letter as unknown as SentLetter);
  return {
    sent,
    codeFor: (address) => {
      const latest = sent()
        .filter((letter) => letter.to === address)
        .at(-1);
      const code = latest?.text.match(/\b(\d{6})\b/)?.[1];
      if (code === undefined) throw new Error(`no code was sent to ${address}`);
      return code;
    },
  };
}

export async function sendCode(email: string, options: { token?: string; ip?: string } = {}) {
  return call('/auth/email-otp/send-verification-otp', {
    body: { email, type: 'sign-in' },
    ...options,
  });
}

export async function signInWithCode(
  email: string,
  otp: string,
  options: { token?: string; ip?: string } = {},
): Promise<Response> {
  return call('/auth/sign-in/email-otp', { body: { email, otp }, ...options });
}
