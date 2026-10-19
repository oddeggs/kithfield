import { CODE_LENGTH } from './options';

/**
 * App Review's way in. The app signs in with Apple, Google or an email code, and a reviewer can't
 * read a code sent to an inbox, so the `REVIEW_ACCOUNT` secret names review-only addresses and the
 * code they sign in with: `{"email": "...", "code": "123456", "companion": "..."}`. The companion
 * (optional) is the second member of the review farm, so it can be opened on a second phone too.
 *
 * For exactly those addresses the email-code sign-in issues that code instead of a random one and
 * mails nothing. Everything else stays as for anyone: the code must be asked for first, lasts ten
 * minutes, allows five tries, and the per-address send and wrong-code limits count it. Unset or
 * unreadable, the feature is off.
 */
export interface ReviewAccount {
  /** The review addresses, trimmed and lowercased. */
  readonly emails: ReadonlySet<string>;
  readonly code: string;
}

const normal = (email: string) => email.trim().toLowerCase();

const isAddress = (value: unknown): value is string =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** The review account from the secret's JSON; null when unset or not as described. */
export function readReviewAccount(raw: string | undefined): ReviewAccount | null {
  if (raw === undefined || raw.trim() === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null;
  }
  const { email, code, companion } = (value ?? {}) as Record<string, unknown>;
  const codeOk = typeof code === 'string' && new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
  if (!isAddress(email) || !codeOk || (companion !== undefined && !isAddress(companion))) {
    // The value itself is never logged: it holds the code.
    console.warn('REVIEW_ACCOUNT is set but unreadable; review sign-in is off');
    return null;
  }
  const emails = new Set([normal(email), ...(isAddress(companion) ? [normal(companion)] : [])]);
  return { emails, code };
}

/** The fixed code for a review address, or undefined for everyone else (a random code). */
export function reviewCodeFor(account: ReviewAccount | null, email: string): string | undefined {
  return account !== null && account.emails.has(normal(email)) ? account.code : undefined;
}
