/*
 * Cloudflare Access in front of the safety desk. Access signs a JWT for everyone it lets in and
 * sends it as `Cf-Access-Jwt-Assertion`; the desk trusts nothing else. The token is checked
 * against the team's published certs (RS256), the team as issuer and this environment's
 * application audience.
 */

export const ACCESS_HEADER = 'Cf-Access-Jwt-Assertion';

/** How the certs are fetched: the one edge a test replaces, with a key of its own. */
export const accessCerts = {
  fetch: (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => fetch(input, init),
};

export interface AccessIdentity {
  readonly email: string;
  readonly subject: string;
}

export interface AccessConfig {
  /** `https://<team>.cloudflareaccess.com`, without a trailing slash. */
  readonly teamDomain: string;
  readonly audience: string;
}

type Jwk = JsonWebKey & { kid?: string };

const CERTS_TTL_MS = 10 * 60_000;
/** An unknown key id fetches the certs again at most this often, so junk tokens can't flood Access. */
const FORCED_REFRESH_MS = 60_000;
/** Clocks drift; Access tokens live for hours, so a minute either way changes nothing. */
const LEEWAY_S = 60;

const cache = new Map<string, { at: number; keys: Map<string, CryptoKey> }>();
const forcedAt = new Map<string, number>();

/** Forgets cached certs, as after a key rotation (and between tests). */
export function forgetAccessCerts(): void {
  cache.clear();
  forcedAt.clear();
}

const base64UrlBytes = (part: string): Uint8Array<ArrayBuffer> => {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

const jsonPart = (part: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlBytes(part)));
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

async function loadKeys(teamDomain: string, now: number): Promise<Map<string, CryptoKey>> {
  const response = await accessCerts.fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`Access certs answered ${response.status}`);
  const body: { keys?: Jwk[] } = await response.json();
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kid === undefined || jwk.kty !== 'RSA' || jwk.n === undefined || jwk.e === undefined) {
      continue;
    }
    const data: JsonWebKey = { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true };
    const key = await crypto.subtle.importKey(
      'jwk',
      data,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    keys.set(jwk.kid, key);
  }
  cache.set(teamDomain, { at: now, keys });
  return keys;
}

/**
 * The key for a key id. Fresh certs are used as they are; stale ones are fetched again, and kept
 * if Access can't be reached. An unknown key id fetches again at most once a minute. With nothing
 * cached and Access unreachable, this throws (the desk answers 503).
 */
async function keyFor(teamDomain: string, kid: string, now: number): Promise<CryptoKey | null> {
  const cached = cache.get(teamDomain);
  if (cached === undefined) return (await loadKeys(teamDomain, now)).get(kid) ?? null;
  const known = cached.keys.get(kid);
  if (known !== undefined) {
    if (now - cached.at < CERTS_TTL_MS) return known;
    try {
      return (await loadKeys(teamDomain, now)).get(kid) ?? null;
    } catch (error) {
      console.error('access certs refresh failed; using the cached ones', { error });
      return known;
    }
  }
  // An unknown key id may mean Access rotated its keys.
  if (now - (forcedAt.get(teamDomain) ?? -Infinity) < FORCED_REFRESH_MS) return null;
  forcedAt.set(teamDomain, now);
  try {
    return (await loadKeys(teamDomain, now)).get(kid) ?? null;
  } catch (error) {
    console.error('access certs refresh failed', { error });
    return null;
  }
}

const audienceMatches = (aud: unknown, expected: string) =>
  aud === expected || (Array.isArray(aud) && aud.includes(expected));

/**
 * The person Access let in, or null for a missing, forged, expired or misdirected token. A service
 * token (no email) is never a moderator.
 */
export async function verifyAccessJwt(
  token: string | undefined,
  config: AccessConfig,
  now = Date.now(),
): Promise<AccessIdentity | null> {
  if (token === undefined || token === '') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = jsonPart(headerPart);
  const claims = jsonPart(payloadPart);
  if (header === null || claims === null) return null;
  if (header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') return null;

  const teamDomain = config.teamDomain.replace(/\/+$/, '');
  const key = await keyFor(teamDomain, header['kid'], now);
  if (key === null) return null;
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const seconds = Math.floor(now / 1000);
  const { iss, aud, exp, nbf, email, sub } = claims;
  if (iss !== teamDomain) return null;
  if (!audienceMatches(aud, config.audience)) return null;
  if (typeof exp !== 'number' || exp + LEEWAY_S < seconds) return null;
  if (typeof nbf === 'number' && nbf - LEEWAY_S > seconds) return null;
  if (typeof email !== 'string' || email === '') return null;
  return { email: email.toLowerCase(), subject: typeof sub === 'string' ? sub : '' };
}
