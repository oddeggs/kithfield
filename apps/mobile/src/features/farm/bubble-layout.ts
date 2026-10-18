/*
 * Where bubbles float over the farm: each above the critter it speaks for, its tail corner toward
 * the critter, nudged up until it covers no bubble already placed. Sizes are estimated from the
 * text (hand lettering at 15 points), which is all placement needs.
 */

export interface BubbleWish {
  readonly key: string;
  readonly text: string;
  /** The critter's head: where the tail points. */
  readonly x: number;
  readonly y: number;
  readonly maxWidth: number;
  /** An extra line under the words ("yours · 23h left"). */
  readonly meta: boolean;
}

export interface PlacedBubble {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly tail: 'left' | 'right';
}

const CHAR = 7.4;
const PAD_X = 22;
const LINE = 16.5;
const PAD_Y = 13;
const META = 14;
const GAP = 4;

/** A bubble's likely size: the hand face averages about 7.4 points a character at 15. */
export function bubbleSize(text: string, maxWidth: number, meta: boolean) {
  const inner = maxWidth - PAD_X;
  const words = text.split(/\s+/);
  let lines = 1;
  let line = 0;
  let widest = 0;
  for (const w of words) {
    const len = w.length * CHAR;
    const next = line === 0 ? len : line + CHAR + len;
    if (next > inner && line > 0) {
      lines += 1;
      widest = Math.max(widest, line);
      line = len;
    } else {
      line = next;
    }
  }
  widest = Math.max(widest, line);
  return {
    width: Math.min(maxWidth, Math.ceil(widest + PAD_X)),
    height: Math.ceil(lines * LINE + PAD_Y + (meta ? META : 0)),
  };
}

const overlaps = (a: PlacedBubble, b: PlacedBubble) =>
  a.left < b.left + b.width + GAP &&
  b.left < a.left + a.width + GAP &&
  a.top < b.top + b.height + GAP &&
  b.top < a.top + a.height + GAP;

/**
 * Places bubbles within `width`, never above `ceiling`. Bubbles nearer the front (lower on the
 * farm) are placed first and keep their spot; those behind move up out of their way.
 */
export function layoutBubbles(
  wishes: readonly BubbleWish[],
  width: number,
  ceiling: number,
  margin = 10,
): PlacedBubble[] {
  const placed: PlacedBubble[] = [];
  for (const w of [...wishes].sort((a, b) => b.y - a.y)) {
    const size = bubbleSize(w.text, w.maxWidth, w.meta);
    const tail = w.x > width / 2 ? 'right' : 'left';
    const rawLeft = tail === 'left' ? w.x - 12 : w.x + 12 - size.width;
    const left = Math.min(width - margin - size.width, Math.max(margin, rawLeft));
    let bubble: PlacedBubble = { key: w.key, left, top: w.y - size.height, tail, ...size };
    for (let guard = 0; guard < placed.length + 1; guard++) {
      const hit = placed.find((p) => overlaps(p, bubble));
      if (!hit) break;
      bubble = { ...bubble, top: hit.top - bubble.height - GAP };
    }
    placed.push({ ...bubble, top: Math.max(ceiling, bubble.top) });
  }
  return placed;
}
