/**
 * Where a sheet settles when the finger lets go. Heights are points of sheet showing above the
 * bottom edge; velocity is points per second, upward positive. Worklets: they run in the gesture.
 */

/** How far ahead a release is projected, in seconds: a flick carries the sheet to the next stop. */
export const PROJECTION_S = 0.2;
/** A modal sheet pulled this far below its lowest stop (or flung down) closes. */
export const DISMISS_FRACTION = 0.5;
/** A flick faster than this, downward, closes a modal sheet from its lowest stop. */
export const DISMISS_VELOCITY = 900;

/** The stop nearest where the release is heading. `detents` ascend. */
export function settleIndex(detents: readonly number[], height: number, velocity: number): number {
  'worklet';
  const aim = height + velocity * PROJECTION_S;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < detents.length; i++) {
    const d = Math.abs((detents[i] ?? 0) - aim);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

/** Whether a modal sheet let go at `height` with `velocity` should close. */
export function shouldDismiss(
  detents: readonly number[],
  height: number,
  velocity: number,
): boolean {
  'worklet';
  const lowest = detents[0] ?? 0;
  if (height >= lowest) return false;
  return height < lowest * DISMISS_FRACTION || velocity < -DISMISS_VELOCITY;
}

/** Past the highest stop the sheet follows the finger at a third of its travel, like iOS. */
export function rubberBand(detents: readonly number[], height: number): number {
  'worklet';
  const highest = detents[detents.length - 1] ?? 0;
  if (height <= highest) return Math.max(0, height);
  return highest + (height - highest) / 3;
}
