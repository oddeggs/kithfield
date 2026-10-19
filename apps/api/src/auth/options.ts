import type { BetterAuthOptions } from 'better-auth';
import { anonymous, bearer, emailOTP } from 'better-auth/plugins';

/** Sign-in codes are six digits and last ten minutes, as the onboarding design asks. */
export const CODE_LENGTH = 6;
export const CODE_LIFETIME_SECONDS = 10 * 60;
/** Wrong guesses allowed on one code before it is spent. */
export const CODE_ATTEMPTS = 5;

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 365;
const SESSION_REFRESH_SECONDS = 60 * 60 * 24;

/**
 * Better Auth's tables, renamed to the D1 schema in `migrations/0001_people_and_sessions.sql`.
 * Better Auth's user is the person: its table is `people`, and the person id is its id.
 */
const userSchema = {
  modelName: 'people',
  fields: {
    name: 'name',
    email: 'email',
    emailVerified: 'email_verified',
    image: 'image',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
} as const;

const sessionSchema = {
  modelName: 'sessions',
  fields: {
    expiresAt: 'expires_at',
    token: 'token',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    ipAddress: 'ip_address',
    userAgent: 'user_agent',
    userId: 'person_id',
  },
} as const;

const accountSchema = {
  modelName: 'accounts',
  fields: {
    accountId: 'account_id',
    providerId: 'provider_id',
    userId: 'person_id',
    accessToken: 'access_token',
    refreshToken: 'refresh_token',
    idToken: 'id_token',
    accessTokenExpiresAt: 'access_token_expires_at',
    refreshTokenExpiresAt: 'refresh_token_expires_at',
    scope: 'scope',
    password: 'password',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
} as const;

const verificationSchema = {
  modelName: 'verifications',
  fields: {
    identifier: 'identifier',
    value: 'value',
    expiresAt: 'expires_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
} as const;

/**
 * Better Auth endpoints Kithfield doesn't use, matched by exact path; the ones with a path
 * parameter (`/callback/:id`, `/reset-password/:token`) are refused in `guards.ts`. There are no
 * passwords, profile edits go through Kithfield's own routes, an anonymous person becomes a
 * signed-in one only through the sign-in endpoints, which keep the person id (see `upgrade.ts`),
 * and the app keeps no provider tokens to refresh.
 */
const disabledPaths = [
  '/sign-up/email',
  '/sign-in/email',
  '/update-user',
  '/change-email',
  '/change-password',
  '/set-password',
  '/request-password-reset',
  '/reset-password',
  '/verify-email',
  '/send-verification-email',
  '/delete-user',
  '/link-social',
  '/unlink-account',
  '/delete-anonymous-user',
  '/forget-password/email-otp',
  '/email-otp/request-password-reset',
  '/email-otp/reset-password',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
  '/email-otp/verify-email',
  '/email-otp/check-verification-otp',
  '/update-session',
  '/get-access-token',
  '/refresh-token',
  '/account-info',
  '/verify-password',
  '/delete-user/callback',
  // Sessions are listed and ended through Kithfield's devices (`/v1/devices`), which also end the
  // device's pushes, key and sockets; Better Auth's list hands out every session's token.
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
];

export interface AuthOptionsInput {
  readonly db: D1Database;
  readonly secret: string;
  readonly baseURL: string;
  /** The app's URL schemes (`kithfield://`), for a cookie-carrying client. */
  readonly trustedOrigins: readonly string[];
  /**
   * Every bundle id Apple may put in the identity token's audience: the environment's own app first,
   * then any other app allowed to sign in here (the store app's beta talks to the dev server).
   */
  readonly appleBundleIds: readonly [string, ...string[]];
  /** Every Google OAuth client id an identity token may be issued for (iOS and web). */
  readonly googleClientIds: readonly string[];
  readonly sendCode: (input: { email: string; code: string }) => Promise<void>;
  /** The fixed sign-in code for an App Review address (`review-account.ts`); undefined otherwise. */
  readonly reviewCode?: (email: string) => string | undefined;
  readonly databaseHooks?: BetterAuthOptions['databaseHooks'];
  readonly hooks?: BetterAuthOptions['hooks'];
}

/**
 * Better Auth for Kithfield, on D1: anonymous first, then Apple, Google or an email code. Phone
 * sign-in is deferred; when it comes, the `phoneNumber` plugin joins the list below and
 * `/phone-number/verify` joins the paths `upgrade.ts` watches.
 *
 * Apple and Google sign in with the identity token the phone's native sheet returns, verified by
 * Better Auth against Apple's and Google's published keys (issuer, audience, expiry, signature).
 * Neither needs a client secret for that, so the redirect flow, which would, is never used.
 */
export function buildAuthOptions(input: AuthOptionsInput): BetterAuthOptions {
  return {
    appName: 'Kithfield',
    baseURL: input.baseURL,
    basePath: '/api/auth',
    secret: input.secret,
    database: input.db,
    trustedOrigins: [...input.trustedOrigins],
    disabledPaths,
    user: userSchema,
    session: {
      ...sessionSchema,
      expiresIn: SESSION_LIFETIME_SECONDS,
      updateAge: SESSION_REFRESH_SECONDS,
    },
    account: {
      ...accountSchema,
      accountLinking: {
        enabled: true,
        // The same verified email from Apple, Google or a code is the same person. No provider is
        // trusted blindly: Better Auth links by email only when the token says it is verified, and
        // `guards.ts` refuses an unverified one before that.
        trustedProviders: [],
      },
    },
    verification: verificationSchema,
    socialProviders: {
      apple: {
        clientId: input.appleBundleIds[0],
        appBundleIdentifier: input.appleBundleIds[0],
        audience: [...input.appleBundleIds],
        // Read only by the redirect flow, which the app never takes.
        clientSecret: 'unused-identity-token-sign-in-only',
      },
      google: {
        clientId: [...input.googleClientIds],
        clientSecret: 'unused-identity-token-sign-in-only',
      },
    },
    plugins: [
      anonymous({
        schema: { user: { fields: { isAnonymous: 'is_anonymous' } } },
        // `upgrade.ts` decides what happens to the anonymous person, so it is never deleted here.
        disableDeleteAnonymousUser: true,
      }),
      emailOTP({
        otpLength: CODE_LENGTH,
        expiresIn: CODE_LIFETIME_SECONDS,
        allowedAttempts: CODE_ATTEMPTS,
        storeOTP: 'hashed',
        // A review address gets its fixed code; everyone else (undefined) a random one.
        ...(input.reviewCode
          ? {
              generateOTP: ({ email, type }: { email: string; type: string }) =>
                type === 'sign-in' ? input.reviewCode?.(email) : undefined,
            }
          : {}),
        sendVerificationOTP: async ({ email, otp }) => {
          await input.sendCode({ email, code: otp });
        },
      }),
      bearer(),
    ],
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rate_limits',
      fields: { key: 'key', count: 'count', lastRequest: 'last_request' },
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/anonymous': { window: 60, max: 10 },
        '/sign-in/social': { window: 60, max: 10 },
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/sign-in/email-otp': { window: 60, max: 10 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    ...(input.databaseHooks ? { databaseHooks: input.databaseHooks } : {}),
    ...(input.hooks ? { hooks: input.hooks } : {}),
    telemetry: { enabled: false },
  };
}
