/**
 * The first-run tips, in the order they show (`12 States`, first-run hints): tap a critter, then
 * press and hold a message, then plant a seed. One at a time, each once.
 */
export const HINTS = ['critter', 'message', 'seed'] as const;
export type Hint = (typeof HINTS)[number];

/** Whether `hint` is the one to show, with `seen` tips behind the person: never ahead, never again. */
export function isDue(seen: number, hint: Hint): boolean {
  return HINTS[seen] === hint;
}

/** Tips behind the person after putting `hint` away: only the due tip moves them on. */
export function afterOk(seen: number, hint: Hint): number {
  return isDue(seen, hint) ? seen + 1 : seen;
}

/** A stored count read back: anything unreadable counts as every tip seen, so none nags. */
export function seenFrom(stored: string | null): number {
  if (stored === null) return 0;
  const n = Number(stored);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, HINTS.length) : HINTS.length;
}
