/**
 * A memoised selection over a store's snapshots, for `useSyncExternalStore`: the selector runs
 * only when the snapshot (or the selector) changed, and an equal result keeps the previous value,
 * so a component re-renders only when what it reads changed.
 */
export function createSelection<S, T>(isEqual: (a: T, b: T) => boolean = Object.is) {
  let last: { source: S; select: (s: S) => T; value: T } | null = null;
  return (source: S, select: (s: S) => T): T => {
    if (last && last.source === source && last.select === select) return last.value;
    const next = select(source);
    const value = last && isEqual(last.value, next) ? last.value : next;
    last = { source, select, value };
    return value;
  };
}
