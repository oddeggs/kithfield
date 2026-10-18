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
  // WeatherKit's `.p8` key (PKCS#8 PEM; newlines may be written as `\n`), for the farm's weather.
  'WEATHERKIT_KEY',
  // RevenueCat's secret REST key, so `POST /v1/purchases/sync` can ask what a person bought.
  'REVENUECAT_SECRET_KEY',
  // The exact `Authorization` header value RevenueCat sends with each webhook.
  'REVENUECAT_WEBHOOK_AUTH',
  // Signs Stripe's webhooks (`Stripe-Signature`), for the printed scrapbook's payments.
  'STRIPE_WEBHOOK_SECRET',
  // The team's APNs key (the `.p8` file's contents), for Live Activity pushes sent straight to
  // Apple. Unset, Live Activities only move while the app runs.
  'APNS_KEY_P8',
  // LiveKit, for the fire room: the project's API key and secret. They mint room tokens and check
  // LiveKit's webhook signatures (`livekit-server --dev` uses devkey / secret locally).
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  // Kithfield's Telegram bot (from @BotFather): makes a person's sticker set with the Bot API
  // once they confirm in Telegram. Not used until the Telegram export routes exist.
  'TELEGRAM_BOT_TOKEN',
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
  /**
   * WeatherKit's REST API: the Apple team, the WeatherKit key's id and the Services ID tokens are
   * issued for (`sub`). Public ids; the key itself is the `WEATHERKIT_KEY` secret.
   */
  readonly WEATHERKIT_TEAM_ID: string;
  readonly WEATHERKIT_KEY_ID: string;
  readonly WEATHERKIT_SERVICE_ID: string;
  /**
   * The newest farm rules version this environment moves farms to (a whole number; prd holds farms
   * at the rules every phone in the store can read). Unset, the server's own `RULES_VERSION`.
   */
  readonly RULES_TARGET?: string;
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
  /** The APNs key's id (the `.p8`'s `AuthKey_<id>`); with `APNS_KEY_P8`, Live Activity pushes. */
  readonly APNS_KEY_ID?: string;
  /** The Apple team the key belongs to; `YFND2EEW8S` when unset. */
  readonly APNS_TEAM_ID?: string;
  /**
   * The APNs hosts to send to, in order, comma-separated; the next is tried only for a token the
   * last called a bad device token. prd: `api.push.apple.com`; dev: the sandbox, then production.
   */
  readonly APNS_HOST?: string;
  /**
   * The LiveKit project the fire room runs on (`wss://<project>.livekit.cloud`); a local
   * `livekit-server --dev` is `ws://localhost:7880`.
   */
  readonly LIVEKIT_URL: string;
  /** At most 20 sign-in nonces a minute per client address. */
  readonly SIGN_IN_NONCE_LIMIT: RateLimit;
  /** Gestures at another farm's gate, per visitor. */
  readonly GATE_LIMIT: RateLimit;
  /** At most 30 lists of the gates a person may visit, a minute per person. */
  readonly GATES_LIMIT: RateLimit;
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
  /** Asking for AI captions: at most 30 a minute per person. */
  readonly AI_LIMIT: RateLimit;
  /** Asking for AI captions: at most 120 a minute per farm. */
  readonly AI_FARM_LIMIT: RateLimit;
  /** The shop's writes, per person: purchase syncs, gifts, chip-ins and wall names. */
  readonly SHOP_LIMIT: RateLimit;
  /** Pieces of a speaker's voice for live captions, per person: about twelve a minute. */
  readonly FIRE_LIMIT: RateLimit;
  /** Email Sending from kithfield.com, such as sign-in codes. */
  readonly EMAIL: SendEmail;
  readonly PUSH_QUEUE: Queue;
  readonly MEDIA_QUEUE: Queue;
  readonly AI_QUEUE: Queue;
  /** Workers AI: voice-note captions, their translation and the Sunday recap letter. */
  readonly AI: Ai;
  readonly DELETION_QUEUE: Queue;
};

export type AppEnv = {
  Bindings: Bindings;
};
