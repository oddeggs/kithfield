import type { Bindings } from '../env';
import type { ExpoMessage, ExpoSilentMessage } from './expo';

/*
 * Firebase Cloud Messaging (HTTP v1), for Android phones: a push goes straight to FCM with the
 * device's own token, signed for with the project's service account. An OAuth access token is
 * minted from a service-account JWT (RS256), kept by the isolate, and reused until a minute
 * before it expires. Each message is a data message the app's notification service draws itself,
 * so it carries the channel, the category's actions and the push's data the way
 * expo-notifications reads them on Android.
 * https://firebase.google.com/docs/cloud-messaging/send/v1-api
 */

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const fcmSendUrl = (project: string) =>
  `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`;

/** An access token is asked for this long; Google's ceiling is an hour. */
const TOKEN_LIFETIME_S = 60 * 60;
/** A cached token is renewed this long before it runs out. */
const RENEW_BEFORE_MS = 60_000;

/** The Android channels the app makes (`features/android/notification-channels`). */
export type AndroidChannel = 'plans' | 'messages' | 'quiet';

/** What sending needs; null when the service account isn't set, which turns Android push off. */
export interface FcmConfig {
  readonly projectId: string;
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly tokenUri: string;
}

/** Reads `FCM_SERVICE_ACCOUNT` (the key's JSON) and `FCM_PROJECT_ID` (else the key's own). */
export function fcmConfig(env: Pick<Bindings, 'FCM_SERVICE_ACCOUNT' | 'FCM_PROJECT_ID'>) {
  const raw = env.FCM_SERVICE_ACCOUNT;
  if (raw === undefined || raw === '') return null;
  let key: Record<string, unknown>;
  try {
    key = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const projectId =
    env.FCM_PROJECT_ID !== undefined && env.FCM_PROJECT_ID !== ''
      ? env.FCM_PROJECT_ID
      : key['project_id'];
  const clientEmail = key['client_email'];
  const privateKey = key['private_key'];
  if (
    typeof projectId !== 'string' ||
    typeof clientEmail !== 'string' ||
    typeof privateKey !== 'string'
  ) {
    return null;
  }
  const tokenUri = typeof key['token_uri'] === 'string' ? key['token_uri'] : GOOGLE_TOKEN_URL;
  return { projectId, clientEmail, privateKey, tokenUri } satisfies FcmConfig;
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const textUrl = (value: string) => base64url(new TextEncoder().encode(value));

/** The PKCS#8 key inside a PEM (the service account's `private_key`). */
function pkcs8Of(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----[A-Z ]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** The service account's signed assertion, asking for FCM's scope for an hour from `now`. */
export async function serviceAccountJwt(config: FcmConfig, now: number): Promise<string> {
  const iat = Math.floor(now / 1000);
  const header = textUrl(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = textUrl(
    JSON.stringify({
      iss: config.clientEmail,
      scope: FCM_SCOPE,
      aud: config.tokenUri,
      iat,
      exp: iat + TOKEN_LIFETIME_S,
    }),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Of(config.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
}

interface CachedToken {
  readonly email: string;
  readonly token: string;
  readonly expiresAt: number;
}

/** This isolate's access token: shared by every push it sends until it is nearly spent. */
let cached: CachedToken | null = null;

/** Forgets the cached token (tests, and after FCM turns one down). */
export function forgetFcmToken(): void {
  cached = null;
}

/** An OAuth access token for FCM: the cached one, or a fresh one from Google. */
export async function fcmAccessToken(
  fetcher: typeof fetch,
  config: FcmConfig,
  now: number,
): Promise<string | null> {
  if (cached !== null && cached.email === config.clientEmail && now < cached.expiresAt) {
    return cached.token;
  }
  const assertion = await serviceAccountJwt(config, now);
  let response: Response;
  try {
    response = await fetcher(config.tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  if (typeof json?.access_token !== 'string') return null;
  const lifetime = typeof json.expires_in === 'number' ? json.expires_in : TOKEN_LIFETIME_S;
  cached = {
    email: config.clientEmail,
    token: json.access_token,
    expiresAt: now + lifetime * 1000 - RENEW_BEFORE_MS,
  };
  return json.access_token;
}

/** Whether a token is Expo's own (`ExponentPushToken[…]`) rather than the device's FCM token. */
export const isExpoToken = (token: string) => /^Expo(nent)?PushToken\[/.test(token);

/** An FCM v1 request body. Every data value is a string. */
export interface FcmMessage {
  readonly message: {
    readonly token: string;
    readonly data: Readonly<Record<string, string>>;
    readonly android: {
      readonly priority: 'HIGH' | 'NORMAL';
      readonly ttl: string;
      readonly collapse_key?: string;
    };
  };
}

/**
 * The FCM message for one push: a data message in the shape expo-notifications draws on Android
 * (`title`, `message`, the push's data as JSON under `body`, the channel, the category whose
 * actions it offers, and the tag that replaces a push already shown).
 */
export function fcmMessage(expo: ExpoMessage, channel: AndroidChannel): FcmMessage {
  return {
    message: {
      token: expo.to,
      data: {
        title: expo.title,
        message: expo.body,
        body: JSON.stringify(expo.data),
        channelId: channel,
        tag: expo.tag,
        threadIdentifier: expo.threadId,
        ...(expo.categoryId !== undefined ? { categoryId: expo.categoryId } : {}),
        // A quiet push makes no sound; the channel decides the rest.
        ...(expo.sound === undefined ? { sound: 'false' } : {}),
      },
      android: {
        priority: expo.priority === 'high' ? 'HIGH' : 'NORMAL',
        ttl: `${expo.ttl}s`,
        collapse_key: expo.collapseId.slice(0, 64),
      },
    },
  };
}

/** A silent push: data only, which the app's background task reads and nothing shows. */
export function fcmSilentMessage(expo: ExpoSilentMessage): FcmMessage {
  return {
    message: {
      token: expo.to,
      data: { body: JSON.stringify(expo.data) },
      android: {
        priority: 'NORMAL',
        ttl: `${expo.ttl}s`,
        collapse_key: expo.collapseId.slice(0, 64),
      },
    },
  };
}

/** What FCM said about one message. */
export type FcmResult =
  | { readonly kind: 'ok'; readonly id: string }
  | { readonly kind: 'retry'; readonly why: string }
  /** The token is no longer the device's: stop pushing to it. */
  | { readonly kind: 'gone'; readonly why: string }
  | { readonly kind: 'refused'; readonly why: string };

/** FCM's error code (such as `UNREGISTERED`) and message, from its error body. */
async function errorOf(response: Response): Promise<{ code: string; message: string }> {
  const json = (await response.json().catch(() => null)) as {
    error?: { status?: unknown; message?: unknown; details?: { errorCode?: unknown }[] };
  } | null;
  const detail = json?.error?.details?.find((d) => typeof d.errorCode === 'string')?.errorCode;
  const status = json?.error?.status;
  const code =
    typeof detail === 'string'
      ? detail
      : typeof status === 'string'
        ? status
        : `http_${response.status}`;
  return { code, message: typeof json?.error?.message === 'string' ? json.error.message : '' };
}

/** Sends one message, minting or reusing the access token; a 401 renews it once. */
export async function sendToFcm(
  fetcher: typeof fetch,
  config: FcmConfig,
  message: FcmMessage,
  now: number,
): Promise<FcmResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await fcmAccessToken(fetcher, config, now);
    if (token === null) return { kind: 'retry', why: 'no_access_token' };
    let response: Response;
    try {
      response = await fetcher(fcmSendUrl(config.projectId), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(message),
      });
    } catch (error) {
      return { kind: 'retry', why: `network: ${String(error)}` };
    }
    if (response.ok) {
      const json = (await response.json().catch(() => null)) as { name?: unknown } | null;
      return { kind: 'ok', id: typeof json?.name === 'string' ? json.name : 'sent' };
    }
    if (response.status === 401 && attempt === 0) {
      forgetFcmToken();
      continue;
    }
    const { code: why, message: said } = await errorOf(response);
    if (why === 'UNREGISTERED' || response.status === 404) return { kind: 'gone', why };
    // A token that isn't one is as good as gone; any other bad argument is the message's fault.
    if (why === 'INVALID_ARGUMENT' && /registration token/i.test(said)) {
      return { kind: 'gone', why };
    }
    if (response.status === 429 || response.status >= 500) return { kind: 'retry', why };
    return { kind: 'refused', why };
  }
  return { kind: 'retry', why: 'unauthorized' };
}
