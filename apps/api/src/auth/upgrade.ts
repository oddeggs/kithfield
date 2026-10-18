import type { BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { parseUserOutput } from 'better-auth/db';

import { isBanned } from './bans';
import { clearCodeFailures, recordCodeFailure } from './email-code';
import { checkBeforeAuth, CODE_SIGN_IN_PATH, SEND_CODE_PATH, SOCIAL_SIGN_IN_PATH } from './guards';
import { announceMerge } from './merge-steps';
import {
  adoptIdentity,
  cancelPendingDeletion,
  deletePerson,
  deleteSession,
  findPerson,
  mergeIntoReturning,
  recordEmailIdentity,
} from './people';
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
 *   id never changes. The anonymous session ends; the response carries the new session, which now
 *   belongs to the anonymous person, and is rewritten to describe them.
 * - **A returning person** (a second device, a reinstall, the same verified email by another
 *   method). The returning person wins (`mergeIntoReturning`, `merge-steps.ts`), the anonymous
 *   person is deleted, and Durable Objects hear of it through the deletion queue.
 *
 * Either way the bearer's person must still be anonymous and unbanned when the upgrade lands, or
 * the sign-in is refused and the session it made is removed. This replaces `/link-social`, which
 * can only attach Apple or Google and fails for a returning identity. Better Auth's response body
 * can lag what a hook did, so the app reads `/get-session` after signing in.
 */

const SIGN_IN_PATHS = new Set([SOCIAL_SIGN_IN_PATH, CODE_SIGN_IN_PATH]);

export interface UpgradeDeps {
  readonly db: D1Database;
  /** Hears `person_merged` so Durable Objects can move the anonymous person's state. */
  readonly deletionQueue: Queue;
}

function banned(): APIError {
  return APIError.fromStatus('FORBIDDEN', { code: 'banned', message: 'This person is banned' });
}

function conflict(): APIError {
  return APIError.fromStatus('CONFLICT', {
    code: 'conflict',
    message: 'This person was signed in by another request',
  });
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
        after: async (session) => {
          await cancelPendingDeletion(db, session.userId);
        },
      },
    },
  };
}

type AfterContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

function codeEmail(ctx: AfterContext): string | null {
  const email = (ctx.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : null;
}

/** Counts a wrong code against its address, or clears the count after a right one. */
async function countCodeOutcome(db: D1Database, ctx: AfterContext): Promise<void> {
  const email = codeEmail(ctx);
  if (email === null) return;
  const returned = ctx.context.returned;
  if (isAPIError(returned)) {
    const code = (returned.body as { code?: unknown } | undefined)?.code;
    if (code === 'INVALID_OTP') await recordCodeFailure(db, email, Date.now());
  } else if (ctx.context.newSession) {
    await clearCodeFailures(db, email);
  }
}

interface Upgraded {
  readonly person: string;
  readonly adopted: boolean;
}

async function upgrade(
  deps: UpgradeDeps,
  ctx: AfterContext,
  input: { anonymous: string; signedIn: { person: string; session: string } },
): Promise<Upgraded> {
  const { db } = deps;
  const now = Date.now();
  const fresh = wasCreatedNow(input.signedIn.person);
  const refuseWith = async (error: APIError): Promise<never> => {
    // Nothing of this sign-in survives: not the person it made, not the session, not the cookie.
    if (fresh) await deletePerson(db, input.signedIn.person);
    else await deleteSession(db, input.signedIn.session);
    ctx.context.responseHeaders?.delete('set-cookie');
    throw error;
  };

  const bearer = await findPerson(db, input.anonymous);
  if (!bearer?.isAnonymous) return refuseWith(conflict());
  if (await isBanned(db, input.anonymous, now)) return refuseWith(banned());

  if (!fresh) {
    const merge = { from: input.anonymous, into: input.signedIn.person, now };
    await mergeIntoReturning(db, { anonymous: merge.from, returning: merge.into, now });
    try {
      await announceMerge(deps.deletionQueue, merge);
    } catch (error) {
      // The merge has committed; only the Durable Objects' copy waits on this message.
      console.error('person_merged was not queued', { from: merge.from, into: merge.into, error });
    }
    return { person: input.signedIn.person, adopted: false };
  }

  const adopted = await adoptIdentity(db, {
    anonymous: input.anonymous,
    fresh: input.signedIn.person,
    now,
  });
  if (!adopted) return refuseWith(conflict());
  return { person: input.anonymous, adopted: true };
}

export function upgradeRequestHooks(deps: UpgradeDeps): NonNullable<BetterAuthOptions['hooks']> {
  return {
    before: createAuthMiddleware(async (ctx) => {
      await checkBeforeAuth(deps.db, ctx);
    }),

    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === SEND_CODE_PATH && letterFailed()) {
        throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
          code: 'unavailable',
          message: 'The letter could not be sent',
        });
      }
      if (ctx.path === CODE_SIGN_IN_PATH) await countCodeOutcome(deps.db, ctx);
      if (!SIGN_IN_PATHS.has(ctx.path)) return;
      const signedIn = ctx.context.newSession;
      if (!signedIn) return;

      // The session the request came with: the anonymous one being upgraded, if any.
      const before = await getSessionFromCtx(ctx, { disableRefresh: true });
      const bearer = before?.user as { id: string; isAnonymous?: boolean | null } | undefined;
      let result: Upgraded = { person: signedIn.user.id, adopted: false };
      if (bearer?.isAnonymous && bearer.id !== signedIn.user.id) {
        result = await upgrade(deps, ctx, {
          anonymous: bearer.id,
          signedIn: { person: signedIn.user.id, session: signedIn.session.id },
        });
      }

      const email = ctx.path === CODE_SIGN_IN_PATH ? codeEmail(ctx) : null;
      if (email !== null) {
        await recordEmailIdentity(deps.db, { person: result.person, email, now: Date.now() });
      }
      if (!result.adopted) return;
      const adopted = await ctx.context.internalAdapter.findUserById(result.person);
      if (!adopted) throw new Error('the upgraded person is missing');
      const returned = ctx.context.returned;
      const body = typeof returned === 'object' && returned !== null ? returned : {};
      return ctx.json({ ...body, user: parseUserOutput(ctx.context.options, adopted) });
    }),
  };
}
