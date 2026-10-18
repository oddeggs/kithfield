/**
 * Socket tokens: short-lived, signed claims that a person may open one socket. The phone gets one
 * from `POST /v1/rt-token` and sends it in its first frame (`hello`), never in the URL. A token
 * with a farm opens that farm's socket; one without opens the person's cottage socket.
 *
 * The signature is HMAC-SHA-256 under a key derived from the auth secret, so the farm and cottage
 * objects verify without a database read.
 */

export const RT_TOKEN_LIFETIME_MS = 5 * 60 * 1000;

const VERSION = 'v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface RtTokenClaims {
  readonly person: string;
  readonly farm: string | null;
  readonly expiresAt: number;
  /** The session it was minted under; its socket closes when that session is ended. */
  readonly session: string | null;
}

/** Whose socket a token is checked for: a farm's, or one person's cottage. */
export type RtTokenScope = { readonly farm: string } | { readonly cottage: string };

const keys = new Map<string, Promise<CryptoKey>>();

function signingKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (key === undefined) {
    key = (async () => {
      const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
        'deriveKey',
      ]);
      return crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new Uint8Array(),
          info: encoder.encode('kithfield socket token v1'),
        },
        material,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign', 'verify'],
      );
    })();
    keys.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function signRtToken(
  secret: string,
  input: { person: string; farm: string | null; now: number; session?: string | null },
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = input.now + RT_TOKEN_LIFETIME_MS;
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({ p: input.person, f: input.farm, e: expiresAt, s: input.session ?? null }),
    ),
  );
  const signed = `${VERSION}.${payload}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    encoder.encode(signed),
  );
  return { token: `${signed}.${toBase64Url(new Uint8Array(signature))}`, expiresAt };
}

function readClaims(json: string): RtTokenClaims | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { p, f, e, s } = value as Record<string, unknown>;
  if (typeof p !== 'string' || (f !== null && typeof f !== 'string') || typeof e !== 'number') {
    return null;
  }
  return { person: p, farm: f, expiresAt: e, session: typeof s === 'string' ? s : null };
}

/**
 * The session a socket token was minted under, read without checking it: only for a token
 * `checkRtToken` already accepted.
 */
export function rtTokenSession(token: unknown): string | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const payload = fromBase64Url(token.split('.')[1] ?? '');
  return payload === null ? null : (readClaims(decoder.decode(payload))?.session ?? null);
}

/**
 * The person a socket token speaks for, or null when it is forged, expired or for another socket.
 * The farm object passes `{farm}` with its own farm id; the cottage passes `{cottage}` with its
 * person id. Membership and bans are not checked here: bans were checked when the token was
 * issued, and the farm checks membership on `hello`.
 */
export async function checkRtToken(
  secret: string,
  token: unknown,
  scope: RtTokenScope,
  now: number = Date.now(),
): Promise<string | null> {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [version, payload, signature, ...rest] = token.split('.');
  if (version !== VERSION || payload === undefined || signature === undefined || rest.length > 0) {
    return null;
  }
  const signatureBytes = fromBase64Url(signature);
  const payloadBytes = fromBase64Url(payload);
  if (signatureBytes === null || payloadBytes === null) return null;
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(secret),
    signatureBytes,
    encoder.encode(`${version}.${payload}`),
  );
  if (!valid) return null;
  const claims = readClaims(decoder.decode(payloadBytes));
  if (claims === null || claims.expiresAt <= now) return null;
  if ('farm' in scope) return claims.farm === scope.farm ? claims.person : null;
  return claims.farm === null && claims.person === scope.cottage ? claims.person : null;
}
