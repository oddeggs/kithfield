/*
 * The compact JWTs LiveKit speaks: HS256 over the API secret, both for the room tokens the API
 * mints and for the `Authorization` header LiveKit signs its webhooks with.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
};

/** Standard base64 of bytes, as LiveKit's webhook `sha256` claim and Twirp `bytes` fields use. */
export const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const keys = new Map<string, Promise<CryptoKey>>();

const hmacKey = (secret: string): Promise<CryptoKey> => {
  let key = keys.get(secret);
  if (key === undefined) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    keys.set(secret, key);
  }
  return key;
};

const HEADER = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

/** Signs `claims` as an HS256 JWT. */
export async function signJwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const body = `${HEADER}.${toBase64Url(encoder.encode(JSON.stringify(claims)))}`;
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The claims of an HS256 JWT signed with `secret` and in date at `nowSeconds`, or null for any
 * token that isn't one (another algorithm, a bad signature, expired, not yet valid).
 */
export async function verifyJwt(
  token: string,
  secret: string,
  nowSeconds: number,
): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head = '', body = '', sig = ''] = parts;
  const header = fromBase64Url(head);
  const payload = fromBase64Url(body);
  const signature = fromBase64Url(sig);
  if (header === null || payload === null || signature === null) return null;
  let alg: unknown;
  let claims: unknown;
  try {
    alg = (JSON.parse(decoder.decode(header)) as { alg?: unknown }).alg;
    claims = JSON.parse(decoder.decode(payload));
  } catch {
    return null;
  }
  if (alg !== 'HS256' || typeof claims !== 'object' || claims === null) return null;
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature,
    encoder.encode(`${head}.${body}`),
  );
  if (!ok) return null;
  const c = claims as Record<string, unknown>;
  // A minute's grace either way for clocks that drift.
  if (typeof c['exp'] === 'number' && c['exp'] + 60 < nowSeconds) return null;
  if (typeof c['nbf'] === 'number' && c['nbf'] - 60 > nowSeconds) return null;
  return c;
}

/** SHA-256 of bytes, as standard base64. */
export async function sha256Base64(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}
