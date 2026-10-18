import { t, type Language } from '@kithfield/i18n';

/** The one address sign-in codes come from; `wrangler.jsonc` allows only it on the binding. */
export const CODE_SENDER = { name: 'Kithfield', email: 'hello@kithfield.com' } as const;

/** At most this many codes go to one address in a window, however many devices ask. */
export const CODE_SENDS_PER_ADDRESS = 5;
export const CODE_SEND_WINDOW_MS = 60 * 60 * 1000;

async function addressHash(email: string): Promise<string> {
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
