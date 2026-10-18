/**
 * A 2D affine transform in canvas order `[a, b, c, d, e, f]`:
 * x' = a·x + c·y + e, y' = b·x + d·y + f.
 */
export type Affine = readonly [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** `m` followed by `n` in the transformed space, as `ctx.transform(...n)` does to `m`. */
export function multiply(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invert(m: Affine): Affine | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return null;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export function isIdentity(m: Affine): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

export function isInvertible(m: Affine): boolean {
  const det = m[0] * m[3] - m[1] * m[2];
  return det !== 0 && Number.isFinite(det) && m.every(Number.isFinite);
}

/** Skia's 3×3 row-major matrix. */
export function toSkia(m: Affine): number[] {
  return [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1];
}

/** The largest scale the transform applies to a length, for stroke and blur radii. */
export function maxScale(m: Affine): number {
  return Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
}
