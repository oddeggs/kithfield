import type { ShopSet } from '@kithfield/contracts';

/* Pure helpers for matching sets: how far along each is, never a count of care. */

export interface SetProgress {
  readonly set: ShopSet;
  readonly have: number;
  readonly total: number;
  /** The pieces still to find, in the set's order. */
  readonly missing: readonly string[];
}

export function progressOf(set: ShopSet, owned: ReadonlySet<string>): SetProgress {
  const missing = set.items.filter((i) => !owned.has(i));
  return { set, have: set.items.length - missing.length, total: set.items.length, missing };
}

/**
 * The set to mention under the collection: the unfinished one closest to done (the first such in
 * the catalogue's order), else a finished one, else none when nothing of any set is owned.
 */
export function closestSet(
  sets: readonly ShopSet[],
  owned: ReadonlySet<string>,
): SetProgress | null {
  const all = sets.map((s) => progressOf(s, owned)).filter((p) => p.have > 0);
  const open = all.filter((p) => p.missing.length > 0);
  if (open.length > 0) {
    return open.reduce((best, p) => (p.have / p.total > best.have / best.total ? p : best));
  }
  return all[0] ?? null;
}
