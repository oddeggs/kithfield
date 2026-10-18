import type { BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { parseUserOutput } from 'better-auth/db';

import { isBanned } from './bans';
import { mayGetAnotherCode } from './email-code';
import { adoptIdentity, deletePerson, mergeIntoReturning } from './people';
import { letterFailed, markCreated, wasCreatedNow } from './sign-in-scope';

/**
 * How an anonymous person becomes a signed-in one, keeping their person id.
 *
 * The app holds an anonymous session from first launch and signs in with Apple, Google (both by
 * identity token at `/sign-in/social`) or an email code (`/sign-in/email-otp`), sending that
 * session's bearer token along. Better Auth resolves the identity to a person; then:
 *
 * - **First time this identity is seen.** Better Auth made a new person for it. The anonymous
 *   person adopts the identity and the new person is folded away (`adoptIdentity`), so the person
 *   id never changes. The response is rewritten to describe the anonymous person; its token is
 *   the new session, which now belongs to them.
 * - **A returning person** (a second device, a reinstall, the same verified email by another
 *   method). The returning person wins: the anonymous person's age check, Terms and onboarding
 *   choices fill only what they lack, and the anonymous person is deleted (`mergeIntoReturning`).
 *   The response already describes the returning person.
 *
 * This replaces `/link-social`, which can only attach Apple or Google and fails for a returning
 * identity: email codes need the same upgrade, and one path keeps the client simple. Better
 * Auth's response body can lag what a hook did, so the app reads `/get-session` after signing in.
 */

const SIGN_IN_PATHS = new Set(['/sign-in/social', '/sign-in/email-otp']);
const SEND_CODE_PATH = '/email-otp/send-verification-otp';

function banned(): APIError {
  return APIError.fromStatus('FORBIDDEN', { code: 'banned', message: 'This person is banned' });
}

export function upgradeDatabaseHooks(
  db: D1Database,
): NonNullable<BetterAuthOptions['databaseHooks']> {
  return {
    user: {
      create: {
        after: (user) => {
          markCreated(user.id);
          return Promise.resolve();
        },
      },
    },
    session: {
      create: {
        // Every session Better Auth issues, for every sign-in method, passes here.
        before: async (session) => {
          if (await isBanned(db, session.userId, Date.now())) throw banned();
        },
      },
    },
  };
}

interface SendCodeBody {
  readonly email?: unknown;
  readonly type?: unknown;
}

export function upgradeRequestHooks(db: D1Database): NonNullable<BetterAuthOptions['hooks']> {
  return {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SEND_CODE_PATH) return;
      const body = (ctx.body ?? {}) as SendCodeBody;
      // Codes are for signing in only; there are no passwords to reset or emails to change.
      if (body.type !== 'sign-in') {
        throw APIError.fromStatus('BAD_REQUEST', {
          code: 'bad_request',
          message: 'Codes are for sign-in',
        });
      }
      if (
        typeof body.email === 'string' &&
        !(await mayGetAnotherCode(db, body.email, Date.now()))
      ) {
        throw APIError.fromStatus('TOO_MANY_REQUESTS', {
          code: 'rate_limited',
          message: 'Too many codes for this address',
        });
      }
    }),

    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === SEND_CODE_PATH && letterFailed()) {
        throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
          code: 'unavailable',
          message: 'The letter could not be sent',
        });
      }
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      const signedIn = ctx.context.newSession;
      if (!signedIn) return;
      // The session the request came with: the anonymous one being upgraded, if any.
      const before = await getSessionFromCtx(ctx, { disableRefresh: true });
      const anonymous = before?.user as { id: string; isAnonymous?: boolean | null } | undefined;
      if (!anonymous?.isAnonymous || anonymous.id === signedIn.user.id) return;
      const now = Date.now();

      if (!wasCreatedNow(signedIn.user.id)) {
        await mergeIntoReturning(db, { anonymous: anonymous.id, returning: signedIn.user.id, now });
        return;
      }

      if (await isBanned(db, anonymous.id, now)) {
        await deletePerson(db, signedIn.user.id);
        throw banned();
      }
      await adoptIdentity(db, { anonymous: anonymous.id, fresh: signedIn.user.id, now });
      const adopted = await ctx.context.internalAdapter.findUserById(anonymous.id);
      if (!adopted) throw new Error('the upgraded person is missing');
      const returned = ctx.context.returned;
      const body = typeof returned === 'object' && returned !== null ? returned : {};
      return ctx.json({ ...body, user: parseUserOutput(ctx.context.options, adopted) });
    }),
  };
}
