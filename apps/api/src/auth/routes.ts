import { AgeRequest, RtTokenRequest, TermsRequest } from '@kithfield/contracts';
import type { RtTokenResponse } from '@kithfield/contracts';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { z } from 'zod';

import { checkAge } from './age';
import { AuthNotConfigured, authSecret, handleAuthRequest } from './instance';
import { deletePerson, findPerson, recordAgeOk, recordTerms } from './people';
import { issueSignInNonce } from './nonce';
import { signRtToken } from './rt-token';
import { errorResponse, requireSession, type SessionEnv } from './session';
import { CURRENT_TERMS_VERSION } from './terms';

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, response: errorResponse(c, 400, 'bad_request') };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const fields = parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 50);
  return { ok: false, response: errorResponse(c, 400, 'bad_request', fields) };
}

/**
 * Sign-in and the person's own records:
 * - `/auth/*`: Better Auth (anonymous, Apple and Google by identity token, email codes, sessions).
 * - `POST /v1/sign-in-nonce`: a single-use nonce for the next Apple or Google sign-in.
 * - `POST /v1/rt-token`: a socket token (a banned person is refused by `requireSession`).
 * - `POST /v1/me/age`, `POST /v1/me/terms`: the age check and the Terms acceptance.
 */
export function authRoutes(): Hono<SessionEnv> {
  const routes = new Hono<SessionEnv>();

  routes.on(['GET', 'POST'], '/auth/*', async (c) => {
    try {
      return await handleAuthRequest(c.env, c.req.raw);
    } catch (error) {
      if (error instanceof AuthNotConfigured) return errorResponse(c, 503, 'unavailable');
      throw error;
    }
  });

  // Before Apple's or Google's sheet opens; no session needed, as a signed-out phone signs in too.
  routes.post('/v1/sign-in-nonce', async (c) => {
    const address = c.req.header('cf-connecting-ip') ?? 'unknown';
    const { success } = await c.env.SIGN_IN_NONCE_LIMIT.limit({ key: address });
    if (!success) return errorResponse(c, 429, 'rate_limited');
    return c.json(await issueSignInNonce(c.env.DB, Date.now()));
  });

  routes.post('/v1/rt-token', requireSession, async (c) => {
    const body = await parseBody(c, RtTokenRequest);
    if (!body.ok) return body.response;
    const now = Date.now();
    const issued = await signRtToken(authSecret(c.env), {
      person: c.var.person,
      farm: body.value.farm ?? null,
      now,
    });
    return c.json(issued satisfies RtTokenResponse);
  });

  routes.post('/v1/me/age', requireSession, async (c) => {
    const body = await parseBody(c, AgeRequest);
    if (!body.ok) return body.response;
    const person = await findPerson(c.env.DB, c.var.person);
    if (person === null) return errorResponse(c, 401, 'unauthorized');
    if (person.ageOk) return c.body(null, 204);
    const now = Date.now();
    switch (checkAge({ ...body.value, now })) {
      case 'invalid':
        return errorResponse(c, 400, 'bad_request', ['birthYear']);
      case 'under_age':
        // The account is not created: the person and their sessions go, and the year is not kept.
        await deletePerson(c.env.DB, person.id);
        return errorResponse(c, 403, 'under_age');
      case 'ok':
        await recordAgeOk(c.env.DB, person.id, now);
        return c.body(null, 204);
    }
  });

  routes.post('/v1/me/terms', requireSession, async (c) => {
    const body = await parseBody(c, TermsRequest);
    if (!body.ok) return body.response;
    if (body.value.version !== CURRENT_TERMS_VERSION) {
      return errorResponse(c, 400, 'bad_request', ['version']);
    }
    await recordTerms(c.env.DB, {
      person: c.var.person,
      version: body.value.version,
      now: Date.now(),
    });
    return c.body(null, 204);
  });

  return routes;
}
