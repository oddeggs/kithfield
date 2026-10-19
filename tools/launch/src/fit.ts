import { type Size } from './limits';

/**
 * The device scale to capture a box at so each of its `slices` (equal, side by side) covers
 * `target`: the larger of the two axis scales, nudged up so rounding never leaves it a pixel short.
 */
export function captureScale(css: Size, slices: number, target: Size): number {
  const [w, h] = css;
  const [tw, th] = target;
  return Math.max(tw / (w / slices), th / h) * 1.0005;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where each target-sized image sits in a capture of `slices` equal panels: centred in its panel,
 * so the few spare pixels the scale leaves are trimmed evenly from each side.
 */
export function sliceRects(captured: Size, slices: number, target: Size): Rect[] {
  const [cw, ch] = captured;
  const [tw, th] = target;
  const panel = cw / slices;
  if (panel < tw || ch < th) {
    throw new Error(`A ${cw}×${ch} capture can't hold ${slices} × ${tw}×${th}`);
  }
  return Array.from({ length: slices }, (_, i) => {
    const left = Math.min(cw - tw, Math.max(0, Math.round(i * panel + (panel - tw) / 2)));
    return { left, top: Math.round((ch - th) / 2), width: tw, height: th };
  });
}
