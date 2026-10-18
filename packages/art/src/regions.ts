/*
 * Where a scene moves: the tiles whose pixels change between frames, joined into a few rectangles
 * so a full-size scene can loop only those parts over a still of itself. Pure geometry, in tiles
 * and pixels; nothing here draws.
 */

/** Tiles over a scene: `cols`×`rows`, each `tile` CSS pixels square; `on` marks a changed tile. */
export interface TileMap {
  readonly cols: number;
  readonly rows: number;
  readonly tile: number;
  readonly on: Uint8Array;
}

export const tileMap = (width: number, height: number, tile: number): TileMap => {
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(height / tile);
  return { cols, rows, tile, on: new Uint8Array(cols * rows) };
};

/**
 * Marks the tiles where `frame` differs from `first` by more than `tolerance` (0 to 255) in any
 * channel, and those within `pad` CSS pixels of such a change. Both are RGBA pixels of a
 * `width`×`height` image drawn at `dpr`, read as 32-bit words.
 */
export function markChanges(
  map: TileMap,
  first: Uint32Array,
  frame: Uint32Array,
  width: number,
  height: number,
  dpr: number,
  tolerance = 0,
  pad = 0,
): void {
  const per = map.tile * dpr;
  const reach = pad * dpr;
  const { on, cols, rows } = map;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const p = frame[row + x] ?? 0;
      const q = first[row + x] ?? 0;
      if (p === q) continue;
      if (tolerance > 0) {
        const d = Math.max(
          Math.abs((p & 255) - (q & 255)),
          Math.abs(((p >>> 8) & 255) - ((q >>> 8) & 255)),
          Math.abs(((p >>> 16) & 255) - ((q >>> 16) & 255)),
          Math.abs((p >>> 24) - (q >>> 24)),
        );
        if (d <= tolerance) continue;
      }
      const x0 = Math.max(0, Math.floor((x - reach) / per));
      const x1 = Math.min(cols - 1, Math.floor((x + reach) / per));
      const y0 = Math.max(0, Math.floor((y - reach) / per));
      const y1 = Math.min(rows - 1, Math.floor((y + reach) / per));
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) on[ty * cols + tx] = 1;
    }
  }
}

/** A rectangle in tiles. */
export interface TileRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const area = (r: TileRect) => r.w * r.h;
const union = (a: TileRect, b: TileRect): TileRect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
};

/**
 * The changed tiles as rectangles: each row's runs, stacked where a run continues the one above,
 * then joined pairwise while joining wastes no more than `slack` of the smaller one's tiles (so a
 * scene ends up with tens of pieces, not hundreds). Every changed tile is covered.
 */
export function rectangles(map: TileMap, slack = 0.1): TileRect[] {
  const { cols, rows, on } = map;
  let open: TileRect[] = [];
  const done: TileRect[] = [];
  for (let y = 0; y < rows; y++) {
    const runs: { x: number; w: number }[] = [];
    for (let x = 0; x < cols; x++) {
      if (!on[y * cols + x]) continue;
      const start = x;
      while (x + 1 < cols && on[y * cols + x + 1]) x++;
      runs.push({ x: start, w: x - start + 1 });
    }
    const next: TileRect[] = [];
    for (const run of runs) {
      const i = open.findIndex((r) => r.x === run.x && r.w === run.w);
      const above = i >= 0 ? open.splice(i, 1)[0] : undefined;
      next.push(above ? { ...above, h: above.h + 1 } : { x: run.x, y, w: run.w, h: 1 });
    }
    done.push(...open);
    open = next;
  }
  const rects = [...done, ...open];
  // Join the pair that wastes least, while it wastes little.
  for (;;) {
    let best: { i: number; j: number; u: TileRect; waste: number } | null = null;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] as TileRect;
        const b = rects[j] as TileRect;
        const u = union(a, b);
        const waste = area(u) - area(a) - area(b);
        // Measured against the smaller, so a large piece never swallows a far-off speck.
        if (waste > Math.max(2, Math.min(area(a), area(b)) * slack)) continue;
        if (!best || waste < best.waste) best = { i, j, u, waste };
      }
    }
    if (!best) return rects;
    rects.splice(best.j, 1);
    rects.splice(best.i, 1, best.u);
  }
}
