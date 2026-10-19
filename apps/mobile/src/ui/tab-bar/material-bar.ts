/**
 * The Material navigation bar's measures in `14 Platforms` (14-05): items 12 below its top edge, a
 * 64×32 pill round a 24 icon, the label 4 under it in 12-point medium type.
 */
export const NAV_BAR = {
  paddingTop: 12,
  pillWidth: 64,
  pillHeight: 32,
  icon: 24,
  labelGap: 4,
  labelSize: 12,
  labelLine: 16,
  /** With three-button navigation the system reports no inset: the bar keeps this much. */
  minBottom: 12,
  /** The dewdrop FAB: 56 square on a 16 corner, 16 from the bar and the edge. */
  fab: 56,
  fabRadius: 16,
  fabGap: 16,
} as const;

/** Below the labels: the gesture handle's inset, or the design's room where there is none. */
export function navBarBottom(bottomInset: number): number {
  return Math.max(bottomInset, NAV_BAR.minBottom);
}

/** The bar's height above the bottom edge. */
export function navBarHeight(bottomInset: number): number {
  return (
    NAV_BAR.paddingTop +
    NAV_BAR.pillHeight +
    NAV_BAR.labelGap +
    NAV_BAR.labelLine +
    navBarBottom(bottomInset)
  );
}
