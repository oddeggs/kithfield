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
  // Seals each farm's current invite code (AES-GCM), so keepers can read their link again.
  'INVITE_CODE_KEY',
  // Signs the keepsakes export's short-lived download links (HMAC-SHA256).
  'EXPORT_URL_KEY',
  // The safety desk's moderators as JSON, address → role: {"name@example.com": "senior"}.
  'MODERATORS',
  // Signs media read URLs (and local upload-proxy PUTs); the media Worker holds the same value.
  'MEDIA_SIGNING_KEY',
  // R2's S3-compatible API, for presigned upload URLs: the account id and an R2 API token's
  // access key pair with Object Read & Write on the media bucket.
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
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
  /** The media bucket's name, for presigned URLs on R2's S3 endpoint. */
  readonly MEDIA_BUCKET_NAME: string;
  /** Where the media Worker serves signed reads (`https://media.kithfield.com`). */
  readonly MEDIA_ORIGIN: string;
  /**
   * Development only: the origin a phone reaches this API at, for upload-proxy URLs when
   * `wrangler dev` rewrites requests to the route's host (`--var
   * MEDIA_UPLOAD_PROXY_ORIGIN:http://localhost:8787`). Unset, the request's own origin.
   */
  readonly MEDIA_UPLOAD_PROXY_ORIGIN?: string;
  /** At most 20 sign-in nonces a minute per client address. */
  readonly SIGN_IN_NONCE_LIMIT: RateLimit;
  /** Gestures at another farm's gate, per visitor. */
  readonly GATE_LIMIT: RateLimit;
  /** At most 60 upload URLs (and forwarding copies) a minute per person. */
  readonly MEDIA_LIMIT: RateLimit;
  /** At most 5 waitlist sign-ups a minute per client address. */
  readonly WAITLIST_LIMIT: RateLimit;
  /** At most 5 account deletion requests or code tries a minute per client address. */
  readonly DELETION_REQUEST_LIMIT: RateLimit;
  /** Desktop sign-in by QR: codes asked per address, and looked up or answered per person. */
  readonly DESKTOP_LINK_LIMIT: RateLimit;
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
