/*
 * Who this person has blocked, for hiding what they say. The settings lane's `useBlocked()`
 * (`data/blocks`) plugs in here; until it does, nobody is blocked.
 */

const NOBODY: ReadonlySet<string> = new Set();

/** The person ids this person blocked. */
export function useBlockedIds(): ReadonlySet<string> {
  return NOBODY;
}
