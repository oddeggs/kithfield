/*
 * One palette of up to 256 colours (with alpha) for every frame of a sticker, by median cut over a
 * 5-5-5-4 bit histogram of its frames, and the frames as palette indexes. Index 0 is fully clear.
 * Pure TypeScript over RGBA bytes (straight alpha), so it runs on the phone as in Node.
 */

/** Pixels this clear count as fully clear. */
const CLEAR = 8;
const BINS = 1 << 19;

/** The histogram bin of a pixel: 5 bits of red, green and blue, 4 of alpha. */
const binOf = (r: number, g: number, b: number, a: number): number =>
  ((r >> 3) << 14) | ((g >> 3) << 9) | ((b >> 3) << 4) | (a >> 4);

export interface Palette {
  /** RGBA per entry, entry 0 clear. */
  readonly colours: Uint8Array;
  readonly size: number;
}

interface Box {
  readonly bins: Int32Array;
  readonly count: number;
  /** Its widest channel and how wide, worked out once. */
  readonly channel: number;
  readonly range: number;
}

/** Weighted channel sums per bin, so a box's colour is the mean of the pixels in it. */
interface Histogram {
  readonly count: Uint32Array;
  readonly sum: Float64Array;
}

function emptyHistogram(): Histogram {
  return { count: new Uint32Array(BINS), sum: new Float64Array(BINS * 4) };
}

/** Counts one frame's pixels (every `step`th) into the histogram. */
function addFrame(h: Histogram, px: Uint8Array, step: number): void {
  const { count, sum } = h;
  for (let i = 0; i < px.length; i += 4 * step) {
    const a = px[i + 3] ?? 0;
    if (a < CLEAR) continue;
    const r = px[i] ?? 0;
    const g = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    const bin = binOf(r, g, b, a);
    count[bin] = (count[bin] ?? 0) + 1;
    const o = bin * 4;
    sum[o] = (sum[o] ?? 0) + r;
    sum[o + 1] = (sum[o + 1] ?? 0) + g;
    sum[o + 2] = (sum[o + 2] ?? 0) + b;
    sum[o + 3] = (sum[o + 3] ?? 0) + a;
  }
}

/** A bin's mean colour channel `c`. */
const mean = (h: Histogram, bin: number, c: number) =>
  (h.sum[bin * 4 + c] ?? 0) / Math.max(1, h.count[bin] ?? 1);

function spread(h: Histogram, bins: Int32Array): { channel: number; range: number } {
  let best = { channel: 0, range: -1 };
  for (let c = 0; c < 4; c++) {
    let lo = 255;
    let hi = 0;
    for (const bin of bins) {
      const v = mean(h, bin, c);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo > best.range) best = { channel: c, range: hi - lo };
  }
  return best;
}

function boxOf(h: Histogram, bins: Int32Array): Box {
  const count = bins.reduce((a, b) => a + (h.count[b] ?? 0), 0);
  return { bins, count, ...spread(h, bins) };
}

/** Splits a box at the weighted median of its widest channel. */
function split(h: Histogram, box: Box, channel: number): [Box, Box] | null {
  const sorted = Array.from(box.bins).sort((x, y) => mean(h, x, channel) - mean(h, y, channel));
  let acc = 0;
  let cut = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    acc += h.count[sorted[i] ?? 0] ?? 0;
    if (acc >= box.count / 2) {
      cut = i + 1;
      break;
    }
    cut = i + 1;
  }
  if (cut <= 0 || cut >= sorted.length) return null;
  const left = Int32Array.from(sorted.slice(0, cut));
  const right = Int32Array.from(sorted.slice(cut));
  return [boxOf(h, left), boxOf(h, right)];
}

/** The palette for a sticker's frames: up to `size` entries, entry 0 clear. */
export function buildPalette(frames: readonly Uint8Array[], size = 256, step = 2): Palette {
  const builder = paletteBuilder(step);
  for (const px of frames) builder.add(px);
  return builder.build(size);
}

/**
 * A palette built a frame at a time, so a bake holds one frame's pixels, not all of them: `add`
 * each frame as it is drawn, then `build` (as many times, at as many sizes, as needed).
 */
export function paletteBuilder(step = 2): {
  add(px: Uint8Array): void;
  build(size?: number): Palette;
} {
  const h = emptyHistogram();
  return {
    add: (px) => addFrame(h, px, step),
    build: (size = 256) => medianCut(h, size),
  };
}

function medianCut(h: Histogram, size: number): Palette {
  const used: number[] = [];
  for (let bin = 0; bin < BINS; bin++) if ((h.count[bin] ?? 0) > 0) used.push(bin);
  let boxes: Box[] = used.length > 0 ? [boxOf(h, Int32Array.from(used))] : [];
  while (boxes.length < size - 1) {
    // The box with the most pixels times the widest colour range goes next.
    let pick = -1;
    let score = 0;
    boxes.forEach((box, i) => {
      const v = box.bins.length < 2 ? 0 : box.range * box.count;
      if (v > score) {
        score = v;
        pick = i;
      }
    });
    const box = boxes[pick];
    if (pick < 0 || !box) break;
    const halves = split(h, box, box.channel);
    if (!halves) break;
    boxes = [...boxes.slice(0, pick), ...halves, ...boxes.slice(pick + 1)];
  }
  const colours = new Uint8Array((boxes.length + 1) * 4);
  boxes.forEach((box, i) => {
    let n = 0;
    const s = [0, 0, 0, 0];
    for (const bin of box.bins) {
      n += h.count[bin] ?? 0;
      for (let c = 0; c < 4; c++) s[c] = (s[c] ?? 0) + (h.sum[bin * 4 + c] ?? 0);
    }
    for (let c = 0; c < 4; c++) colours[(i + 1) * 4 + c] = Math.round((s[c] ?? 0) / Math.max(1, n));
  });
  return { colours, size: boxes.length + 1 };
}

/** Maps frames to palette indexes, sharing one nearest-colour cache across them. */
export function indexer(palette: Palette): (px: Uint8Array) => Uint8Array {
  const cache = new Int16Array(BINS).fill(-1);
  const { colours, size } = palette;
  const nearest = (r: number, g: number, b: number, a: number): number => {
    let best = 1;
    let bestD = Infinity;
    for (let i = 1; i < size; i++) {
      const o = i * 4;
      const dr = r - (colours[o] ?? 0);
      const dg = g - (colours[o + 1] ?? 0);
      const db = b - (colours[o + 2] ?? 0);
      const da = a - (colours[o + 3] ?? 0);
      // Colour differences matter less the clearer the pixel; alpha always matters.
      const d = ((dr * dr + dg * dg + db * db) * a) / 255 + da * da * 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  return (px) => {
    const out = new Uint8Array(px.length / 4);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const a = px[i + 3] ?? 0;
      if (a < CLEAR || size < 2) continue;
      const r = px[i] ?? 0;
      const g = px[i + 1] ?? 0;
      const b = px[i + 2] ?? 0;
      const bin = binOf(r, g, b, a);
      let idx = cache[bin] ?? -1;
      if (idx < 0) {
        idx = nearest(r, g, b, a);
        cache[bin] = idx;
      }
      out[j] = idx;
    }
    return out;
  };
}
