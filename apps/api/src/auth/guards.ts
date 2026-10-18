import { APIError } from 'better-auth/api';

import { isAddressLocked, mayGetAnotherCode } from './email-code';
import { consumeSignInNonce, reserveIdToken } from './nonce';

/**
 * Checks made before Better Auth handles a request. Better Auth verifies an identity token's
 * signature, issuer, audience, age and nonce claim itself; these add what Kithfield needs on top.
 */

export const SOCIAL_SIGN_IN_PATH = '/sign-in/social';
export const SEND_CODE_PATH = '/email-otp/send-verification-otp';
export const CODE_SIGN_IN_PATH = '/sign-in/email-otp';

interface BeforeContext {
  readonly path: string;
  readonly body?: unknown;
}

function refuse(
  status: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'TOO_MANY_REQUESTS',
  code: string,
  message: string,
): APIError {
  return APIError.fromStatus(status, { code, message });
}

/** The claims of a JWT, unverified: read only to refuse early, never to trust. */
function unverifiedClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(json, (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof claims === 'object' && claims !== null
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Apple and Google both say whether they verified the email in `email_verified` (Apple as the
 * string "true", private relay addresses included). Only a verified email may name a person:
 * Better Auth finds people by email, so an unverified one could reach someone else's account.
 */
function emailIsVerified(claims: Record<string, unknown>): boolean {
  return claims['email_verified'] === true || claims['email_verified'] === 'true';
}

interface SocialBody {
  readonly idToken?: { readonly token?: unknown; readonly nonce?: unknown };
}

async function checkSocialSignIn(db: D1Database, body: SocialBody, now: number): Promise<void> {
  const token = body.idToken?.token;
  // The app signs in with the token from the phone's own sheet; the redirect flow is never used.
  if (typeof token !== 'string' || token === '') {
    throw refuse('BAD_REQUEST', 'bad_request', 'Sign in with an identity token');
  }
  const claims = unverifiedClaims(token);
  if (claims === null) throw refuse('UNAUTHORIZED', 'invalid_token', 'Unreadable identity token');
  if (!emailIsVerified(claims)) {
    throw refuse('UNAUTHORIZED', 'email_unverified', 'The provider has not verified this email');
  }
  const nonce = body.idToken?.nonce;
  if (typeof nonce !== 'string' || nonce === '') {
    throw refuse('UNAUTHORIZED', 'nonce_invalid', 'A sign-in nonce is needed');
  }
  const exp = typeof claims['exp'] === 'number' ? claims['exp'] * 1000 : now;
  if (!(await reserveIdToken(db, { idToken: token, expiresAt: exp, now }))) {
    throw refuse('UNAUTHORIZED', 'token_reused', 'This identity token was already used');
  }
  if (!(await consumeSignInNonce(db, nonce, now))) {
    throw refuse('UNAUTHORIZED', 'nonce_invalid', 'This sign-in nonce is unknown, used or expired');
  }
}

interface CodeBody {
  readonly email?: unknown;
  readonly type?: unknown;
}

async function checkCodeRequest(
  db: D1Database,
  path: string,
  body: CodeBody,
  now: number,
): Promise<void> {
  // Codes are for signing in only; there are no passwords to reset or emails to change.
  if (path === SEND_CODE_PATH && body.type !== 'sign-in') {
    throw refuse('BAD_REQUEST', 'bad_request', 'Codes are for sign-in');
  }
  if (typeof body.email !== 'string') return;
  if (await isAddressLocked(db, body.email, now)) {
    throw refuse('TOO_MANY_REQUESTS', 'rate_limited', 'Too many wrong codes for this address');
  }
  if (path === SEND_CODE_PATH && !(await mayGetAnotherCode(db, body.email, now))) {
    throw refuse('TOO_MANY_REQUESTS', 'rate_limited', 'Too many codes for this address');
  }
}

export async function checkBeforeAuth(db: D1Database, ctx: BeforeContext): Promise<void> {
  const now = Date.now();
  // Redirect flows and password links: the app never takes them.
  if (ctx.path.startsWith('/callback') || ctx.path.startsWith('/reset-password/')) {
    throw refuse('NOT_FOUND', 'not_found', 'Not found');
  }
  if (ctx.path === SOCIAL_SIGN_IN_PATH) {
    await checkSocialSignIn(db, ctx.body ?? {}, now);
  }
  if (ctx.path === SEND_CODE_PATH || ctx.path === CODE_SIGN_IN_PATH) {
    await checkCodeRequest(db, ctx.path, ctx.body ?? {}, now);
  }
}
