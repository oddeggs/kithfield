import type { Bindings } from '../env';

/*
 * Apple's push service, called directly for Live Activities (Expo's push service doesn't send
 * them). APNs speaks HTTP/2 only, and a Worker's `fetch` reaches it (checked 19 Oct 2026 from a
 * remote preview: both hosts answered a made-up token with `BadDeviceToken`). A provider token
 * (ES256 JWT) from the team's APNs key signs each request. It is made once for every isolate, kept
 * in D1, and reused for 50 minutes; Apple refuses a key refreshed more often than every 20.
 * https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications
 */

export const APNS_PRODUCTION = 'api.push.apple.com';
export const APNS_SANDBOX = 'api.sandbox.push.apple.com';
const DEFAULT_TEAM = 'YFND2EEW8S';
/** A token is reused this long. */
const TOKEN_LIFETIME_MS = 50 * 60_000;
/** Never a new token sooner than this after the last (`TooManyProviderTokenUpdates`). */
export const MIN_REFRESH_MS = 20 * 60_000;

/** What sending needs; null when the key isn't set, which turns remote activities off. */
export interface ApnsConfig {
  readonly keyP8: string;
  readonly keyId: string;
  readonly teamId: string;
  /** The server's own app (`APPLE_BUNDLE_ID`): the topic for a token that names no other. */
  readonly bundleId: string;
  /**
   * The other apps this server serves (`APPLE_EXTRA_BUNDLE_IDS`), such as the store app's beta
   * on the development server. A token from one of them is pushed on its own topic.
   */
  readonly extraBundleIds?: readonly string[];
  /**
   * The hosts to send to, in order; the next is tried only for a token the last called a bad
   * device token (a development build's token lives on the sandbox).
   */
  readonly hosts: readonly string[];
}

const listOf = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

/**
 * The app a push goes to: the one its token was registered for when this server serves that app,
 * else the server's own.
 */
export function bundleFor(config: ApnsConfig, bundleId: string | null | undefined): string {
  if (bundleId === null || bundleId === undefined) return config.bundleId;
  return bundleId === config.bundleId || (config.extraBundleIds ?? []).includes(bundleId)
    ? bundleId
    : config.bundleId;
}

export function apnsConfig(env: Bindings): ApnsConfig | null {
  const keyP8 = env.APNS_KEY_P8;
  const keyId = env.APNS_KEY_ID;
  if (keyP8 === undefined || keyP8 === '' || keyId === undefined || keyId === '') return null;
  const hosts = listOf(env.APNS_HOST);
  return {
    keyP8,
    keyId,
    teamId: env.APNS_TEAM_ID ?? DEFAULT_TEAM,
    bundleId: env.APPLE_BUNDLE_ID,
    extraBundleIds: listOf(env.APPLE_EXTRA_BUNDLE_IDS),
    hosts: hosts.length > 0 ? hosts : [APNS_PRODUCTION, APNS_SANDBOX],
  };
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const textUrl = (value: string) => base64url(new TextEncoder().encode(value));

/** The PKCS#8 key inside a `.p8` file's PEM armour (or the bare base64 of it). */
function pkcs8Of(p8: string): Uint8Array<ArrayBuffer> {
  const body = p8.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

export interface ProviderToken {
  readonly jwt: string;
  readonly issuedAt: number;
}

/** Where every isolate finds the token: D1 in the Worker, nothing in a test that doesn't care. */
export interface TokenStore {
  read(keyId: string): Promise<ProviderToken | null>;
  /** Keeps `next` if the kept token is still `prev`; answers whether it did. */
  swap(keyId: string, prev: ProviderToken | null, next: ProviderToken): Promise<boolean>;
}

export function d1TokenStore(db: D1Database): TokenStore {
  return {
    async read(keyId) {
      const row = await db
        .prepare('SELECT jwt, issued_at AS issuedAt FROM apns_tokens WHERE key_id = ?')
        .bind(keyId)
        .first<ProviderToken>();
      return row ?? null;
    },
    async swap(keyId, prev, next) {
      const result =
        prev === null
          ? await db
              .prepare(
                'INSERT OR IGNORE INTO apns_tokens (key_id, jwt, issued_at) VALUES (?, ?, ?)',
              )
              .bind(keyId, next.jwt, next.issuedAt)
              .run()
          : await db
              .prepare(
                'UPDATE apns_tokens SET jwt = ?, issued_at = ? WHERE key_id = ? AND issued_at = ?',
              )
              .bind(next.jwt, next.issuedAt, keyId, prev.issuedAt)
              .run();
      return result.meta.changes > 0;
    },
  };
}

/** A store for one isolate only (tests that don't care which isolate made the token). */
export function memoryTokenStore(): TokenStore {
  const kept = new Map<string, ProviderToken>();
  return {
    read: (keyId) => Promise.resolve(kept.get(keyId) ?? null),
    swap: (keyId, prev, next) => {
      const now = kept.get(keyId) ?? null;
      if (now?.issuedAt !== prev?.issuedAt) return Promise.resolve(false);
      kept.set(keyId, next);
      return Promise.resolve(true);
    },
  };
}

const cached = new Map<string, ProviderToken>();
/** A token Apple called expired: the next is made as soon as the 20 minutes allow. */
const expired = new Map<string, number>();

const cacheKey = (config: ApnsConfig) => `${config.teamId}.${config.keyId}`;

async function mint(config: ApnsConfig, now: number): Promise<ProviderToken> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Of(config.keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = textUrl(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const claims = textUrl(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const input = `${header}.${claims}`;
  // WebCrypto gives ECDSA signatures as r ‖ s, the form JWS wants.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(input),
  );
  return { jwt: `${input}.${base64url(new Uint8Array(signature))}`, issuedAt: now };
}

/** Whether a token may still be used at `now`. */
function usable(config: ApnsConfig, token: ProviderToken, now: number): boolean {
  const age = now - token.issuedAt;
  if (age < MIN_REFRESH_MS) return true;
  if (expired.get(cacheKey(config)) === token.issuedAt) return false;
  return age < TOKEN_LIFETIME_MS;
}

/**
 * The provider token for a key: the one in memory, else the one in the store, else a new one,
 * kept in the store only if no other isolate kept one first (then theirs is used).
 */
export async function providerToken(
  config: ApnsConfig,
  now: number,
  store: TokenStore = memoryTokenStore(),
): Promise<string> {
  const id = cacheKey(config);
  const inMemory = cached.get(id);
  if (inMemory !== undefined && usable(config, inMemory, now)) return inMemory.jwt;
  const stored = await store.read(id);
  if (stored !== null && usable(config, stored, now)) {
    cached.set(id, stored);
    return stored.jwt;
  }
  const made = await mint(config, now);
  const kept = (await store.swap(id, stored, made)) ? made : ((await store.read(id)) ?? made);
  cached.set(id, kept);
  return kept.jwt;
}

/** Forgets the tokens this isolate holds (tests). */
export function forgetProviderTokens(): void {
  cached.clear();
  expired.clear();
}

/** How a send went: delivered, a token APNs no longer takes, or a failure to leave be. */
export type ApnsResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'dead'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

export interface LiveActivityPush {
  readonly token: string;
  readonly payload: unknown;
  /** 10 for what should show now (a start, an end), 5 for the rest, which iOS may pace. */
  readonly priority: 5 | 10;
  /** The bundle id of the app the token was registered for; absent or null is the server's. */
  readonly bundleId?: string | null;
}

async function post(
  fetcher: typeof fetch,
  config: ApnsConfig,
  host: string,
  push: LiveActivityPush,
  jwt: string,
  now: number,
): Promise<{ status: number; reason: string }> {
  const response = await fetcher(`https://${host}/3/device/${push.token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-push-type': 'liveactivity',
      'apns-topic': `${bundleFor(config, push.bundleId)}.push-type.liveactivity`,
      'apns-priority': String(push.priority),
      // An update an hour late is worse than none.
      'apns-expiration': String(Math.floor(now / 1000) + 60 * 60),
      'content-type': 'application/json',
    },
    body: JSON.stringify(push.payload),
  });
  if (response.ok) return { status: response.status, reason: '' };
  const body = (await response.json().catch(() => null)) as { reason?: unknown } | null;
  return {
    status: response.status,
    reason: typeof body?.reason === 'string' ? body.reason : `http_${response.status}`,
  };
}

/** Reasons that mean the token is gone for good: it is dropped. */
const DEAD = new Set(['BadDeviceToken', 'Unregistered', 'ExpiredToken']);

/**
 * Sends one Live Activity push, to each host in turn while the last called the token a bad device
 * token. A token Apple calls expired is replaced as soon as the 20 minutes allow; "too many
 * updates" keeps it and fails, to be tried again later.
 */
export async function sendLiveActivity(
  fetcher: typeof fetch,
  config: ApnsConfig,
  push: LiveActivityPush,
  now: number,
  store: TokenStore = memoryTokenStore(),
): Promise<ApnsResult> {
  try {
    const jwt = await providerToken(config, now, store);
    let answer = { status: 0, reason: 'no_host' };
    for (const host of config.hosts) {
      answer = await post(fetcher, config, host, push, jwt, now);
      if (answer.reason !== 'BadDeviceToken') break;
    }
    if (answer.reason === '') return { kind: 'ok' };
    if (answer.status === 410 || DEAD.has(answer.reason)) {
      return { kind: 'dead', reason: answer.reason };
    }
    if (answer.reason === 'ExpiredProviderToken') {
      const token = cached.get(cacheKey(config));
      if (token !== undefined && token.jwt === jwt) expired.set(cacheKey(config), token.issuedAt);
    }
    return { kind: 'failed', reason: answer.reason };
  } catch (error) {
    return { kind: 'failed', reason: `network: ${String(error)}` };
  }
}
