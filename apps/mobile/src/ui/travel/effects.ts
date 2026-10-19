import { useCallback } from 'react';

import type { AnchorId } from './registry';
import { timing } from './timings';
import { useTravel } from './travel-host';

/** The storyboard's pencil-blue ripples: two, the second smaller and a moment later. */
const RIPPLE = 'rgba(95,159,189,0.85)';
const RINGS = [
  { width: 120, height: 40, delayMs: 0 },
  { width: 80, height: 26, delayMs: 60 },
] as const;
/** How far a ripple spreads beyond its size, and how small it starts. */
const SPREAD = 1.6;
const START = 0.2;

/**
 * Two pencil ripples on an anchor (a dewdrop landing): spreading out and fading, or, `inward`,
 * running back in as the dewdrop is taken back. Nothing under Reduce Motion.
 */
export function useRipples(): (on: AnchorId, inward?: boolean) => void {
  const { fly } = useTravel();
  return useCallback(
    (on, inward = false) => {
      const ms = timing('dewdrop', 'total') * 0.45;
      for (const r of RINGS) {
        const small = r.width * START;
        const wide = r.width * SPREAD;
        fly({
          from: on,
          to: on,
          sprite: { ring: RIPPLE, width: r.width, height: r.height },
          fromWidth: inward ? wide : small,
          toWidth: inward ? small : wide,
          arc: 0,
          fade: inward ? 'in' : 'out',
          hideSource: false,
          hideTarget: false,
          delayMs: r.delayMs,
          durationMs: ms,
        });
      }
    },
    [fly],
  );
}
