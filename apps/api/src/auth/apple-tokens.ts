import { Hono } from 'hono';
import { z } from 'zod';

import type { Bindings } from '../env';
import { errorResponse, requireSession, type SessionEnv } from './session';

/*
 * Sign in with Apple's tokens, so deleting an account can revoke them, as Apple asks of every app
 * that offers it. The phone signs in with the identity token alone; right after an Apple sign-in it
 * also hands over the sheet's one-time authorization code (`POST /v1/me/apple-authorization`).
 * The server swaps that for a refresh token at Apple and keeps it on the person's Apple identity
 * (`accounts.refresh_token`); the purge revokes it. Both calls sign a short client secret with
 * the team's Sign in with Apple key: `APPLE_SIGN_IN_KEY_P8` and `APPLE_SIGN_IN_KEY_ID`. Without
 * them this is off: codes are accepted and dropped, and there is nothing to revoke.
 */

const APPLE = 'https://appleid.apple.com';
const DEFAULT_TEAM = 'YFND2EEW8S';
/** A client secret lives a few minutes: it is made for each call. */
const SECRET_LIFETIME_S = 5 * 60;

export interface AppleKey {
  readonly keyP8: string;
  readonly keyId: string;
  readonly teamId: string;
  /** The app's bundle id: the client the native sheet's codes and tokens are issued to. */
  readonly clientId: string;
}

export function appleKeyOf(env: Bindings): AppleKey | null {
  const keyP8 = env.APPLE_SIGN_IN_KEY_P8;
  const keyId = env.APPLE_SIGN_IN_KEY_ID;
  if (!keyP8 || !keyId) return null;
  return { keyP8, keyId, teamId: env.APNS_TEAM_ID ?? DEFAULT_TEAM, clientId: env.APPLE_BUNDLE_ID };
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const textUrl = (value: string) => base64url(new TextEncoder().encode(value));

/** The client secret Apple's token and revoke endpoints take: an ES256 JWT from the key. */
export async function clientSecret(key: AppleKey, now: number): Promise<string> {
  const body = key.keyP8.replace(/-----[A-Z ]+-----/g, '').replace(/\\n|\s+/g, '');
  const signer = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const iat = Math.floor(now / 1000);
  const header = textUrl(JSON.stringify({ alg: 'ES256', kid: key.keyId }));
  const claims = textUrl(
    JSON.stringify({
      iss: key.teamId,
      iat,
      exp: iat + SECRET_LIFETIME_S,
      aud: APPLE,
      sub: key.clientId,
    }),
  );
  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signer,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

const TokenAnswer = z.object({ refresh_token: z.string().min(1), id_token: z.string().min(1) });

/** Whose Apple identity a token from Apple names (`sub`); read only to match it to the person. */
function subjectOf(idToken: string): string | null {
  const part = idToken.split('.')[1];
  if (part === undefined) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/** Swaps an authorization code for a refresh token and the Apple identity it belongs to. */
export async function exchangeCode(
  key: AppleKey,
  code: string,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<{ refreshToken: string; subject: string } | null> {
  const response = await fetcher(`${APPLE}/auth/token`, {
    method: 'POST',
    headers: FORM,
    body: form({
      client_id: key.clientId,
      client_secret: await clientSecret(key, now),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) return null;
  const answer = TokenAnswer.safeParse(await response.json().catch(() => null));
  if (!answer.success) return null;
  const subject = subjectOf(answer.data.id_token);
  return subject === null ? null : { refreshToken: answer.data.refresh_token, subject };
}

/** Revokes a refresh token. Apple answers 200 for one it no longer knows; anything else throws. */
export async function revokeToken(
  key: AppleKey,
  token: string,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(`${APPLE}/auth/revoke`, {
    method: 'POST',
    headers: FORM,
    body: form({
      client_id: key.clientId,
      client_secret: await clientSecret(key, now),
      token,
      token_type_hint: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`Apple's revoke answered ${response.status}`);
}

/** Where the routes and the purge reach Apple; tests stand in for it. */
export const appleFetch: { current: typeof fetch } = {
  current: (input, init) => fetch(input, init),
};

const AuthorizationRequest = z.object({ code: z.string().min(1).max(1024) });

/** `POST /v1/me/apple-authorization`: keeps the refresh token an Apple sign-in's code gives. */
export function appleTokenRoutes(): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();
  routes.post('/v1/me/apple-authorization', requireSession, async (c) => {
    const parsed = AuthorizationRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return errorResponse(c, 400, 'bad_request', ['code']);
    const key = appleKeyOf(c.env);
    if (key === null) return c.body(null, 204);
    const got = await exchangeCode(key, parsed.data.code, Date.now(), appleFetch.current).catch(
      () => null,
    );
    if (got === null) return errorResponse(c, 400, 'bad_request', ['code']);
    // Only the person's own Apple identity takes the token.
    const kept = await c.env.DB.prepare(
      `UPDATE accounts SET refresh_token = ?, updated_at = ?
       WHERE person_id = ? AND provider_id = 'apple' AND account_id = ?`,
    )
      .bind(got.refreshToken, new Date().toISOString(), c.var.person, got.subject)
      .run();
    if (kept.meta.changes === 0) {
      // A code for someone else's Apple identity: give Apple its token back.
      await revokeToken(key, got.refreshToken, Date.now(), appleFetch.current).catch(
        () => undefined,
      );
      return errorResponse(c, 403, 'forbidden', ['code']);
    }
    return c.body(null, 204);
  });
  return routes;
}

/** Revokes every Apple refresh token the person's identities hold; the purge calls it. */
export async function revokeAppleTokens(env: Bindings, person: string): Promise<void> {
  const key = appleKeyOf(env);
  if (key === null) return;
  const { results } = await env.DB.prepare(
    `SELECT refresh_token FROM accounts
     WHERE person_id = ? AND provider_id = 'apple' AND refresh_token IS NOT NULL`,
  )
    .bind(person)
    .all<{ refresh_token: string }>();
  for (const row of results) {
    await revokeToken(key, row.refresh_token, Date.now(), appleFetch.current);
  }
}
