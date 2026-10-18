/** A rectangle of a frame, in pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The smallest rectangle holding every pixel that differs between two RGBA frames of the same
 * size, with its top-left corner moved to a multiple of `align` (WebP frames start on even
 * pixels). Null when the frames are the same.
 */
export function changedRect(
  prev: Uint8Array,
  next: Uint8Array,
  width: number,
  height: number,
  align = 2,
): Rect | null {
  if (prev.length !== width * height * 4 || next.length !== prev.length) {
    throw new Error('Frames must be RGBA of the given size');
  }
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const base = y * row;
    let first = -1;
    let last = -1;
    for (let i = 0; i < row; i++) {
      if (prev[base + i] !== next[base + i]) {
        first = i;
        break;
      }
    }
    if (first < 0) continue;
    for (let i = row - 1; i >= first; i--) {
      if (prev[base + i] !== next[base + i]) {
        last = i;
        break;
      }
    }
    if (top < 0) top = y;
    bottom = y;
    left = Math.min(left, Math.floor(first / 4));
    right = Math.max(right, Math.floor(last / 4));
  }
  if (top < 0) return null;
  const x = left - (left % align);
  const y = top - (top % align);
  return { x, y, w: right + 1 - x, h: bottom + 1 - y };
}

/** Copies a rectangle out of an RGBA frame. */
export function cropRgba(pixels: Uint8Array, width: number, rect: Rect): Uint8Array {
  const out = new Uint8Array(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * width + rect.x) * 4;
    out.set(pixels.subarray(from, from + rect.w * 4), y * rect.w * 4);
  }
  return out;
}
