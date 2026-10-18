import { vi } from 'vitest';

/**
 * A stand-in for Apple's and Google's identity-token issuers: the only test double in the sign-in
 * tests, and only at the network boundary. It holds an RS256 key pair, signs identity tokens, and
 * answers Better Auth's requests for Apple's and Google's public keys with its own. Better Auth's
 * real verifier still checks the signature, issuer, audience, age and expiry of every token.
 */

const KEY_URLS = new Set([
  'https://appleid.apple.com/auth/keys',
  'https://www.googleapis.com/oauth2/v3/certs',
]);

/** The audiences the dev environment's `wrangler.jsonc` accepts. */
export const DEV_APPLE_AUDIENCE = 'com.kithfield.app.dev';
export const DEV_GOOGLE_IOS_AUDIENCE =
  '564934268570-n2lmcq3r3vc060p5hsankdnisfnalk0v.apps.googleusercontent.com';
export const DEV_GOOGLE_WEB_AUDIENCE =
  '564934268570-hst5dob3msctegnpgskivamd25gh6jbc.apps.googleusercontent.com';

type Claims = Record<string, unknown>;

export interface TestIdentityProvider {
  /** A token from Apple's sheet for `sub`; `claims` override any default. */
  appleToken(sub: string, claims?: Claims): Promise<string>;
  /** A token from Google's sheet for `sub`; `claims` override any default. */
  googleToken(sub: string, claims?: Claims): Promise<string>;
  /** A token signed by a key the published key set doesn't have. */
  forgedToken(claims: Claims): Promise<string>;
}

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const algorithm = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
} as const;

async function newKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
}

async function signJwt(privateKey: CryptoKey, kid: string, claims: Claims): Promise<string> {
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    algorithm.name,
    privateKey,
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

/** Starts the stand-in; `vi.restoreAllMocks()` stops it. */
export async function startTestIdentityProvider(): Promise<TestIdentityProvider> {
  const kid = crypto.randomUUID();
  const keys = await newKeyPair();
  const stranger = await newKeyPair();
  const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const keySet = JSON.stringify({ keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] });

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (KEY_URLS.has(requestUrl(input))) {
      return Promise.resolve(
        new Response(keySet, { headers: { 'content-type': 'application/json' } }),
      );
    }
    return realFetch(input, init);
  });

  const now = () => Math.floor(Date.now() / 1000);
  const base = (iss: string, aud: string, sub: string): Claims => ({
    iss,
    aud,
    sub,
    iat: now(),
    exp: now() + 600,
  });

  return {
    appleToken: (sub, claims = {}) =>
      signJwt(keys.privateKey, kid, {
        ...base('https://appleid.apple.com', DEV_APPLE_AUDIENCE, sub),
        email: `${sub}@privaterelay.appleid.com`,
        email_verified: 'true',
        ...claims,
      }),
    googleToken: (sub, claims = {}) =>
      signJwt(keys.privateKey, kid, {
        ...base('https://accounts.google.com', DEV_GOOGLE_IOS_AUDIENCE, sub),
        email: `${sub}@gmail.example`,
        email_verified: true,
        name: 'A Friend',
        ...claims,
      }),
    forgedToken: (claims) =>
      signJwt(stranger.privateKey, kid, { iat: now(), exp: now() + 600, ...claims }),
  };
}
