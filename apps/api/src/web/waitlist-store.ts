/**
 * The launch list's keys and retention (`docs/backend.md` §4): addresses are keyed by an HMAC of
 * the address, unconfirmed rows are deleted after a week, and the raw address goes once the launch
 * letter has.
 */

/** An address nobody confirms is forgotten after a week. */
export const UNCONFIRMED_KEEP_MS = 7 * 24 * 60 * 60_000;

/** The confirmation token in the letter: 32 random bytes, base64url. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The list's key for an address: HMAC-SHA256 under the secret, of the trimmed, lowercased address. */
export async function waitlistEmailHash(secret: string, email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return hex(mac);
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export function confirmationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The rate limit's key for a client address. An IPv6 client usually holds a whole /64, so it is
 * limited as one; an IPv4 address is its own key.
 */
export function clientKey(address: string): string {
  if (!address.includes(':')) return address;
  const [head = '', tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = address.includes('::') && tail ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  const prefix = groups
    .slice(0, 4)
    .map((g) => (Number.parseInt(g, 16) || 0).toString(16))
    .join(':');
  return `${prefix}::/64`;
}

/** Deletes the rows nobody confirmed within a week. */
export async function purgeUnconfirmedWaitlist(db: D1Database, now: number): Promise<number> {
  const result = await db
    .prepare('DELETE FROM waitlist WHERE confirmed_at IS NULL AND created_at <= ?')
    .bind(now - UNCONFIRMED_KEEP_MS)
    .run();
  return result.meta.changes;
}

/** Clears the raw address of everyone the launch letter has reached; the hash stays. */
export async function forgetNotifiedEmails(db: D1Database): Promise<number> {
  const result = await db
    .prepare('UPDATE waitlist SET email = NULL WHERE notified_at IS NOT NULL AND email IS NOT NULL')
    .run();
  return result.meta.changes;
}

/** Deletes early critter picks over a week old: by then their address confirmed or was forgotten. */
export async function purgeOldPicks(db: D1Database, now: number): Promise<number> {
  const result = await db
    .prepare('DELETE FROM waitlist_picks WHERE requested_at <= ?')
    .bind(now - UNCONFIRMED_KEEP_MS)
    .run();
  return result.meta.changes;
}

/** The daily job: every retention rule. */
export async function keepWaitlistTidy(
  db: D1Database,
  now: number,
): Promise<{ unconfirmed: number; emails: number; picks: number }> {
  const unconfirmed = await purgeUnconfirmedWaitlist(db, now);
  const emails = await forgetNotifiedEmails(db);
  const picks = await purgeOldPicks(db, now);
  return { unconfirmed, emails, picks };
}
