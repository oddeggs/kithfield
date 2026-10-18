import { t, type Language } from '@kithfield/i18n';

/** The one address sign-in codes come from; `wrangler.jsonc` allows only it on the binding. */
export const CODE_SENDER = { name: 'Kithfield', email: 'hello@kithfield.com' } as const;

/** At most this many codes go to one address in a window, however many devices ask. */
export const CODE_SENDS_PER_ADDRESS = 5;
export const CODE_SEND_WINDOW_MS = 60 * 60 * 1000;

/**
 * After this many wrong codes for one address in a day, the address can neither get nor try codes
 * until the oldest of them is a day old. Codes aren't checked while it is locked, so nothing new is
 * counted and the lock always lifts; a right code clears the count. Someone locked out by a
 * stranger can still come in with Apple or Google on the same verified email.
 */
export const CODE_FAILURES_PER_ADDRESS = 10;
export const CODE_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function addressHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Whether another code may go to this address now. */
export async function mayGetAnotherCode(
  db: D1Database,
  email: string,
  now: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS sends FROM email_code_sends WHERE address_hash = ? AND sent_at > ?',
    )
    .bind(await addressHash(email), now - CODE_SEND_WINDOW_MS)
    .first<{ sends: number }>();
  return (row?.sends ?? 0) < CODE_SENDS_PER_ADDRESS;
}

/** Whether too many wrong codes were tried for this address in the last day. */
export async function isAddressLocked(
  db: D1Database,
  email: string,
  now: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS failures FROM email_code_failures WHERE address_hash = ? AND failed_at > ?',
    )
    .bind(await addressHash(email), now - CODE_FAILURE_WINDOW_MS)
    .first<{ failures: number }>();
  return (row?.failures ?? 0) >= CODE_FAILURES_PER_ADDRESS;
}

export async function recordCodeFailure(db: D1Database, email: string, now: number): Promise<void> {
  const hash = await addressHash(email);
  await db.batch([
    db
      .prepare('DELETE FROM email_code_failures WHERE address_hash = ? AND failed_at <= ?')
      .bind(hash, now - CODE_FAILURE_WINDOW_MS),
    db
      .prepare('INSERT INTO email_code_failures (address_hash, failed_at) VALUES (?, ?)')
      .bind(hash, now),
  ]);
}

export async function clearCodeFailures(db: D1Database, email: string): Promise<void> {
  await db
    .prepare('DELETE FROM email_code_failures WHERE address_hash = ?')
    .bind(await addressHash(email))
    .run();
}

/**
 * Whether an unexpired sign-in code is waiting for this address: Better Auth's verification row,
 * named `sign-in-otp-<address>`.
 */
export async function hasPendingCode(db: D1Database, email: string, now: number): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT 1 AS pending FROM verifications WHERE identifier = ? AND expires_at > ? LIMIT 1',
    )
    .bind(`sign-in-otp-${email.trim().toLowerCase()}`, new Date(now).toISOString())
    .first();
  return row !== null;
}

async function recordSend(db: D1Database, email: string, now: number): Promise<void> {
  const hash = await addressHash(email);
  await db.batch([
    db
      .prepare('DELETE FROM email_code_sends WHERE address_hash = ? AND sent_at <= ?')
      .bind(hash, now - CODE_SEND_WINDOW_MS),
    db
      .prepare('INSERT INTO email_code_sends (address_hash, sent_at) VALUES (?, ?)')
      .bind(hash, now),
  ]);
}

export function codeLetter(language: Language, code: string): { subject: string; text: string } {
  return {
    subject: t(language, 'signInCode.subject', { code }),
    text: [
      t(language, 'signInCode.greeting'),
      '',
      t(language, 'signInCode.code', { code }),
      t(language, 'signInCode.lifetime'),
      '',
      t(language, 'signInCode.notYou'),
      '',
      t(language, 'signInCode.signOff'),
    ].join('\n'),
  };
}

/** Sends a sign-in code through Cloudflare Email Sending and records the send for the limit. */
export async function sendCodeLetter(
  input: { email: SendEmail; db: D1Database },
  letter: { to: string; code: string; language: Language; now: number },
): Promise<void> {
  const { subject, text } = codeLetter(letter.language, letter.code);
  await input.email.send({ from: CODE_SENDER, to: letter.to, subject, text });
  await recordSend(input.db, letter.to, letter.now);
}
