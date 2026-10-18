import { type ErrorCode, FarmId, type PersonId, type Role } from '@kithfield/contracts';
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

import { requireSession, type SessionEnv } from '../auth';
import { ACTION_KEY_HEADER, requireActionKey } from '../cottage/action-key';
import type { Bindings } from '../env';
import { roleOf } from './d1';

/* Shared pieces of the farm routes: errors, bodies, the caller and their membership. */

export type Ctx = Context<SessionEnv>;

export const fail = (c: Ctx, status: ContentfulStatusCode, code: ErrorCode, fields?: string[]) =>
  c.json({ error: fields === undefined ? { code } : { code, fields } }, status);

/** Parses a JSON body; on failure, the response to send instead. */
export const body = async <S extends z.ZodType>(
  c: Ctx,
  schema: S,
): Promise<z.infer<S> | Response> => {
  const raw: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const fields = parsed.error.issues.map((i) => i.path.join('.')).slice(0, 50);
  return fail(c, 400, 'bad_request', fields);
};

export const farmStub = (env: Bindings, farm: string) => env.FARM.get(env.FARM.idFromName(farm));

/** The signed-in person (auth's session), as `c.var.person`. */
export const signedIn: MiddlewareHandler<SessionEnv> = requireSession;

/**
 * A session, or a device's action key (the share extension and notification replies, which have
 * no session). Either way the caller is `c.var.person`.
 */
const byActionKey = requireActionKey();

export const sessionOrActionKey: MiddlewareHandler<SessionEnv> = async (c, next) => {
  if (c.req.header(ACTION_KEY_HEADER) === undefined) return requireSession(c, next);
  const keyed = c as unknown as Parameters<typeof byActionKey>[0];
  return byActionKey(keyed, async () => {
    c.set('person', keyed.get('actionPerson'));
    await next();
  });
};

/** The farm id in the path, or null when it can't be one. */
export const farmParam = (c: Ctx): string | null => {
  const parsed = FarmId.safeParse(c.req.param('id'));
  return parsed.success ? parsed.data : null;
};

export type Member = { person: PersonId; farm: string; role: Role };

/** The caller, if they live on the farm in the path (and hold one of `roles`, when given). */
export const member = async (c: Ctx, roles?: readonly Role[]): Promise<Member | Response> => {
  const person = c.get('person');
  const farm = farmParam(c);
  if (farm === null) return fail(c, 404, 'not_found');
  const role = await roleOf(c.env.DB, farm, person);
  if (role === null) return fail(c, 404, 'not_found');
  if (roles !== undefined && !roles.includes(role)) return fail(c, 403, 'forbidden');
  return { person, farm, role };
};

/** Where invite links point: the website's `/i/<code>` on this environment's host. */
export const inviteUrl = (env: Bindings, code: string): string =>
  `https://${env.ENVIRONMENT === 'prd' ? '' : 'dev.'}kithfield.com/i/${code}`;
