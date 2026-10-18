import { pickLanguage } from '@kithfield/i18n';
import { betterAuth } from 'better-auth';

import type { Bindings, EnvironmentName } from '../env';
import { sendCodeLetter } from './email-code';
import { buildAuthOptions } from './options';
import { markLetterFailed, scopeLanguage, withSignInScope } from './sign-in-scope';
import { upgradeDatabaseHooks, upgradeRequestHooks } from './upgrade';

/** Where the API lives per environment; Better Auth builds its own URLs from it. */
const baseURLs: Readonly<Record<EnvironmentName, string>> = {
  dev: 'https://dev.kithfield.com',
  prd: 'https://kithfield.com',
};

/** The app's URL scheme per environment (`apps/mobile/app.config.ts`). */
const appSchemes: Readonly<Record<EnvironmentName, string>> = {
  dev: 'kithfield-dev://',
  prd: 'kithfield://',
};

/** Thrown when the environment lacks the auth secret; the routes answer `unavailable`. */
export class AuthNotConfigured extends Error {
  constructor() {
    super('BETTER_AUTH_SECRET is not set for this environment');
  }
}

export function authSecret(env: Bindings): string {
  const secret = env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret.length < 32) throw new AuthNotConfigured();
  return secret;
}

function createAuth(env: Bindings) {
  return betterAuth(
    buildAuthOptions({
      db: env.DB,
      secret: authSecret(env),
      baseURL: baseURLs[env.ENVIRONMENT],
      trustedOrigins: [appSchemes[env.ENVIRONMENT]],
      appleBundleId: env.APPLE_BUNDLE_ID,
      googleClientIds: [env.GOOGLE_IOS_CLIENT_ID, env.GOOGLE_WEB_CLIENT_ID],
      sendCode: async ({ email, code }) => {
        try {
          await sendCodeLetter(
            { email: env.EMAIL, db: env.DB },
            { to: email, code, language: scopeLanguage(), now: Date.now() },
          );
        } catch (error) {
          markLetterFailed();
          throw error;
        }
      },
      databaseHooks: upgradeDatabaseHooks(env.DB),
      hooks: upgradeRequestHooks({ db: env.DB, deletionQueue: env.DELETION_QUEUE }),
    }),
  );
}

export type Auth = ReturnType<typeof createAuth>;

// One instance per isolate and environment object: building Better Auth is not free.
const instances = new WeakMap<Bindings, Auth>();

export function authFor(env: Bindings): Auth {
  let auth = instances.get(env);
  if (auth === undefined) {
    auth = createAuth(env);
    instances.set(env, auth);
  }
  return auth;
}

/** The request's languages in preference order, from `Accept-Language`. */
function requestLanguages(request: Request): string[] {
  const header = request.headers.get('accept-language') ?? '';
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((param) => param.trim().startsWith('q='));
      return { tag: tag.trim(), weight: q === undefined ? 1 : Number(q.trim().slice(2)) || 0 };
    })
    .filter((entry) => entry.tag !== '' && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.tag);
}

/** Hands one request to Better Auth, inside the scope its hooks share. */
export function handleAuthRequest(env: Bindings, request: Request): Promise<Response> {
  const auth = authFor(env);
  return withSignInScope(pickLanguage(requestLanguages(request)), () => auth.handler(request));
}
