import type { CottageDO } from './cottage/cottage-object';
import type { FarmDO } from './farm/farm-object';

/**
 * Secrets the Worker expects, by name. Values live in Wrangler secrets (deployed) or `.dev.vars`
 * (local, ignored by git); `.dev.vars.example` lists the same names.
 */
export const secretNames = [
  // Signs sessions and socket tokens.
  'BETTER_AUTH_SECRET',
  // Expo's enhanced push security: sent with every push request once it is turned on.
  'EXPO_ACCESS_TOKEN',
  // Keys the waitlist's address hashes (HMAC-SHA256), so a listed address can't be brute-forced.
  'WAITLIST_EMAIL_KEY',
  // The safety desk's moderators as JSON, address → role: {"name@example.com": "senior"}.
  'MODERATORS',
] as const;
export type SecretName = (typeof secretNames)[number];

/** A secret is absent until it has been set for the environment, so readers must handle that. */
export type Secrets = { readonly [K in SecretName]?: string };

export type EnvironmentName = 'dev' | 'prd';

/** Everything `wrangler.jsonc` binds for an environment, plus the secrets. */
export type Bindings = Secrets & {
  readonly ENVIRONMENT: EnvironmentName;
  readonly COMMIT_SHA: string;
  /** The website's origin (`https://kithfield.com`), for links in letters. */
  readonly SITE_ORIGIN: string;
  /** The bundle id Apple issues identity tokens for (`com.kithfield.app[.dev]`). */
  readonly APPLE_BUNDLE_ID: string;
  /** Google OAuth client ids an identity token may name: the iOS app's and the web/server one. */
  readonly GOOGLE_IOS_CLIENT_ID: string;
  readonly GOOGLE_WEB_CLIENT_ID: string;
  /** The Cloudflare Access team the safety desk signs in through (`https://<team>.cloudflareaccess.com`). */
  readonly ACCESS_TEAM_DOMAIN: string;
  /** The Access application audience (`aud`) for this environment's safety desk. */
  readonly ACCESS_AUD: string;
  /** One farm object per farm or visit. */
  readonly FARM: DurableObjectNamespace<FarmDO>;
  /** One cottage object per person. */
  readonly COTTAGE: DurableObjectNamespace<CottageDO>;
  readonly DB: D1Database;
  /** Photos, video, voice notes, files and export bundles. */
  readonly MEDIA: R2Bucket;
  /** At most 20 sign-in nonces a minute per client address. */
  readonly SIGN_IN_NONCE_LIMIT: RateLimit;
  /** Gestures at another farm's gate, per visitor. */
  readonly GATE_LIMIT: RateLimit;
  /** At most 5 waitlist sign-ups a minute per client address. */
  readonly WAITLIST_LIMIT: RateLimit;
  /** Reports and appeals from the app, per person. */
  readonly REPORT_LIMIT: RateLimit;
  /** Email Sending from kithfield.com, such as sign-in codes. */
  readonly EMAIL: SendEmail;
  readonly PUSH_QUEUE: Queue;
  readonly MEDIA_QUEUE: Queue;
  readonly AI_QUEUE: Queue;
  readonly DELETION_QUEUE: Queue;
};

export type AppEnv = {
  Bindings: Bindings;
};
