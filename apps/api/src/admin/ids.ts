import { RuleRef } from '@kithfield/contracts';

/*
 * Ids for the safety desk's records: a letter for what it is, then random characters people can
 * read aloud on a call (no 0/O or 1/I).
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type IdPrefix = 'R' | 'A' | 'P' | 'N' | 'L';

/** `R-7KQ2M9XH` for a report; `A-` an action, `P-` an appeal, `N-` a note, `L-` an audit entry. */
export function mintId(prefix: IdPrefix): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${out}`;
}

/** A rule as stored in D1 (JSON), or null. */
export const ruleToDb = (rule: RuleRef | null): string | null =>
  rule === null ? null : JSON.stringify(rule);

/** A stored rule read back; anything unreadable is null. */
export function ruleFromDb(raw: string | null): RuleRef | null {
  if (raw === null) return null;
  try {
    const parsed = RuleRef.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
