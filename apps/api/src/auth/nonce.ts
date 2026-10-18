/**
 * Single-use sign-in nonces and identity-token replay protection, stored in `verifications`.
 *
 * Before opening Apple's or Google's sheet the app asks `POST /v1/sign-in-nonce` for a nonce and
 * hands it to the sheet: Apple puts its SHA-256 (hex) in the token's `nonce` claim, Google the nonce
 * itself. The app sends the raw nonce with the token; it must be one this server issued, unexpired
 * and unused, and Better Auth then checks the token's claim against it. Each identity token is also
 * reserved by its hash until it expires, so the same token never signs in twice.
 */

export const NONCE_LIFETIME_MS = 10 * 60 * 1000;

const NONCE_PREFIX = 'sign-in-nonce:';
const TOKEN_PREFIX = 'id-token:';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function insertVerification(
  db: D1Database,
  input: { identifier: string; expiresAt: number; now: number },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO verifications (id, identifier, value, expires_at, created_at, updated_at)
       SELECT ?1, ?2, '1', ?3, ?4, ?4
       WHERE NOT EXISTS (SELECT 1 FROM verifications WHERE identifier = ?2)`,
    )
    .bind(crypto.randomUUID(), input.identifier, iso(input.expiresAt), iso(input.now));
}

/**
 * Deletes a kind's expired rows. The prefix becomes a range on `identifier` (`prefix:` up to
 * `prefix;`, the next character), so the identifier index serves it where `LIKE` would not.
 */
function deleteExpired(db: D1Database, prefix: string, now: number): D1PreparedStatement {
  const upTo = `${prefix.slice(0, -1)};`;
  return db
    .prepare(
      'DELETE FROM verifications WHERE identifier >= ? AND identifier < ? AND expires_at <= ?',
    )
    .bind(prefix, upTo, iso(now));
}

export async function issueSignInNonce(
  db: D1Database,
  now: number,
): Promise<{ nonce: string; expiresAt: number }> {
  const nonce = randomNonce();
  const expiresAt = now + NONCE_LIFETIME_MS;
  await db.batch([
    deleteExpired(db, NONCE_PREFIX, now),
    insertVerification(db, { identifier: NONCE_PREFIX + (await sha256Hex(nonce)), expiresAt, now }),
  ]);
  return { nonce, expiresAt };
}

/** Spends a nonce: true only the first time, and only while it is unexpired. */
export async function consumeSignInNonce(
  db: D1Database,
  nonce: string,
  now: number,
): Promise<boolean> {
  const spent = await db
    .prepare('DELETE FROM verifications WHERE identifier = ? RETURNING expires_at')
    .bind(NONCE_PREFIX + (await sha256Hex(nonce)))
    .all<{ expires_at: string }>();
  return spent.results.some((row) => row.expires_at > iso(now));
}

/** Reserves an identity token until it expires: true only the first time it is seen. */
export async function reserveIdToken(
  db: D1Database,
  input: { idToken: string; expiresAt: number; now: number },
): Promise<boolean> {
  const [, inserted] = await db.batch([
    deleteExpired(db, TOKEN_PREFIX, input.now),
    insertVerification(db, {
      identifier: TOKEN_PREFIX + (await sha256Hex(input.idToken)),
      expiresAt: Math.max(input.expiresAt, input.now + 60_000),
      now: input.now,
    }),
  ]);
  return inserted?.meta.changes === 1;
}
