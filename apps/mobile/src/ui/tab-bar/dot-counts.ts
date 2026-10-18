import { tabs, type TabName } from './tabs';

/** How many callers are asking for each tab's dot. */
export type DotCounts = Readonly<Record<TabName, number>>;

export const noDotCounts: DotCounts = { farm: 0, chat: 0, seedbed: 0, you: 0 };

/** One more (or one fewer) caller asking for `tab`'s dot; never below none. */
export function countDot(counts: DotCounts, tab: TabName, delta: 1 | -1): DotCounts {
  const next = Math.max(0, counts[tab] + delta);
  return next === counts[tab] ? counts : { ...counts, [tab]: next };
}

/** A dot shows while anyone asks for it. It never says how many. */
export function dotsOf(counts: DotCounts): Readonly<Record<TabName, boolean>> {
  return Object.fromEntries(tabs.map((t) => [t, counts[t] > 0])) as Record<TabName, boolean>;
}
