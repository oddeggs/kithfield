/** Golden comparison: mean and worst absolute differences between two RGBA buffers. */
export interface Diff {
  /** Mean absolute difference per channel, premultiplied, in 0–255 units. */
  mean: number;
  /** Share of pixels where some channel differs by more than 16. */
  over16: number;
  max: number;
}

/** The pass mark: a mean difference of at most 2/255 per scene. */
export const GOLDEN_MEAN_LIMIT = 2;

/** Premultiplies unpremultiplied RGBA (as `getImageData` returns it), in place. */
export function premultiply(rgba: Uint8Array): Uint8Array {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] ?? 0;
    if (a === 255) continue;
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(((rgba[i + c] ?? 0) * a) / 255);
  }
  return rgba;
}

export function diff(a: Uint8Array, b: Uint8Array): Diff {
  if (a.length !== b.length) throw new Error(`size mismatch: ${a.length} vs ${b.length}`);
  let sum = 0;
  let max = 0;
  let over = 0;
  for (let i = 0; i < a.length; i += 4) {
    let px = 0;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs((a[i + c] ?? 0) - (b[i + c] ?? 0));
      sum += d;
      if (d > px) px = d;
    }
    if (px > max) max = px;
    if (px > 16) over++;
  }
  return { mean: sum / a.length, over16: over / (a.length / 4), max };
}

/** A visual diff: the reference greyed, differences in red scaled by `gain`. */
export function diffImage(a: Uint8Array, b: Uint8Array, gain = 8): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs((a[i + c] ?? 0) - (b[i + c] ?? 0)));
    const grey = ((a[i] ?? 0) + (a[i + 1] ?? 0) + (a[i + 2] ?? 0)) / 12 + 160;
    out[i] = Math.min(255, grey + d * gain);
    out[i + 1] = Math.max(0, grey - d * gain);
    out[i + 2] = Math.max(0, grey - d * gain);
    out[i + 3] = 255;
  }
  return out;
}
