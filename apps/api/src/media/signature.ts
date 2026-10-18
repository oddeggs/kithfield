/*
 * Signed media URLs: an HMAC-SHA256 over what the URL allows, keyed by `MEDIA_SIGNING_KEY`, which
 * the API and the media Worker share. Reads are `GET <media origin>/<key>?exp=&sig=`; the
 * development upload proxy signs its PUTs the same way under another purpose, so a read signature
 * can never be used to write. No imports: the media Worker bundles this file as it is.
 */

/** An R2 object key as the contracts define it: `farm/<farm id>/<uuid>`. */
export const MEDIA_KEY = /^farm\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}$/;

/** The farm a key belongs to, or null when it isn't a media key. */
export function farmOfKey(key: string): string | null {
  if (!MEDIA_KEY.test(key)) return null;
  return key.split('/')[1] ?? null;
}

/** What a signature allows. Each purpose signs a different message. */
export type SignedPurpose = 'read' | 'put';

/** A signing key shorter than this is treated as missing. */
export const MIN_SIGNING_KEY_LENGTH = 32;

const encoder = new TextEncoder();

const toBase64Url = (bytes: ArrayBuffer): string => {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(text)) return null;
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    usage,
  ]);

const message = (purpose: SignedPurpose, fields: readonly string[]) =>
  encoder.encode([purpose, ...fields].join('\n'));

/** The URL-safe signature of `fields` for `purpose`. */
export async function signFields(
  secret: string,
  purpose: SignedPurpose,
  fields: readonly string[],
): Promise<string> {
  const key = await hmacKey(secret, 'sign');
  return toBase64Url(await crypto.subtle.sign('HMAC', key, message(purpose, fields)));
}

/** Whether `signature` signs `fields` for `purpose`; compared in constant time by WebCrypto. */
export async function verifyFields(
  secret: string,
  purpose: SignedPurpose,
  fields: readonly string[],
  signature: string,
): Promise<boolean> {
  const bytes = fromBase64Url(signature);
  if (bytes === null) return false;
  const key = await hmacKey(secret, 'verify');
  return crypto.subtle.verify('HMAC', key, bytes, message(purpose, fields));
}

/** Read URLs are reissued on a half-hour grid, so one URL serves everyone for a while. */
export const READ_WINDOW_MS = 30 * 60_000;

/** When a read URL made at `now` expires: at least 30 minutes on, at most an hour. */
export const readExpiry = (now: number): number =>
  Math.ceil((now + READ_WINDOW_MS) / READ_WINDOW_MS) * READ_WINDOW_MS;

/** A signed read URL on the media origin (`https://media.kithfield.com`, no trailing slash). */
export async function signedReadUrl(
  origin: string,
  secret: string,
  key: string,
  expiresAt: number,
): Promise<string> {
  const exp = String(Math.floor(expiresAt / 1000));
  const sig = await signFields(secret, 'read', [key, exp]);
  return `${origin}/${key}?exp=${exp}&sig=${sig}`;
}

/** The URL's path without its leading slash, decoded; null when it doesn't decode. */
function decodedPath(url: URL): string | null {
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
}

/** The object key a read URL is for, when it is signed and not yet expired; else null. */
export async function verifyReadUrl(secret: string, url: URL, now: number): Promise<string | null> {
  const key = decodedPath(url);
  if (key === null) return null;
  const exp = url.searchParams.get('exp') ?? '';
  const sig = url.searchParams.get('sig') ?? '';
  if (!MEDIA_KEY.test(key) || !/^\d{1,12}$/.test(exp)) return null;
  if (Number(exp) * 1000 <= now) return null;
  return (await verifyFields(secret, 'read', [key, exp], sig)) ? key : null;
}

/** The media key in a URL Cloudflare's scanning flagged (any media URL, signed or not). */
export function keyOfMediaUrl(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const key = decodedPath(url);
  return key !== null && MEDIA_KEY.test(key) ? key : null;
}
