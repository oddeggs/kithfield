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
  /** Placed in this order, lowest first (statuses before labels); then front to back. */
  readonly order?: number;
}

export interface PlacedBubble {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly tail: 'left' | 'right';
}

/**
 * Bubbles over the farm grow with the reader's text size up to this many times; past it the
 * farm itself would be covered, and VoiceOver reads each status with its critter instead.
 */
export const BUBBLE_MAX_SCALE = 1.6;

const CHAR = 7.4;
const PAD_X = 22;
const LINE = 16.5;
const PAD_Y = 13;
const META = 14;
const GAP = 4;

/**
 * A bubble's likely size: the hand face averages about 7.4 points a character at 15, times the
 * text size it is drawn at (`scale`, at most `BUBBLE_MAX_SCALE`).
 */
export function bubbleSize(text: string, maxWidth: number, meta: boolean, scale = 1) {
  const s = Math.min(Math.max(scale, 1), BUBBLE_MAX_SCALE);
  const inner = maxWidth * Math.min(s, 1.25) - PAD_X;
  const words = text.split(/\s+/);
  let lines = 1;
  let line = 0;
  let widest = 0;
  for (const w of words) {
    const len = w.length * CHAR * s;
    const next = line === 0 ? len : line + CHAR * s + len;
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
    width: Math.min(maxWidth * Math.min(s, 1.25), Math.ceil(widest + PAD_X)),
    height: Math.ceil(lines * LINE * s + PAD_Y + (meta ? META * s : 0)),
  };
}

const overlaps = (a: PlacedBubble, b: PlacedBubble) =>
  a.left < b.left + b.width + GAP &&
  b.left < a.left + a.width + GAP &&
  a.top < b.top + b.height + GAP &&
  b.top < a.top + a.height + GAP;

/**
 * Places bubbles within `width`, never above `ceiling`, in priority order (`order`, then front
 * to back). Each sits on top of its critter's drawing, beside the head: to the left, then to the
 * right; if both are taken it lifts by half and then one bubble's height. A bubble with no room
 * is left out rather than stacked away from what it speaks for, and none ever covers its own
 * critter or another bubble.
 */
export function layoutBubbles(
  wishes: readonly BubbleWish[],
  width: number,
  ceiling: number,
  margin = 10,
  scale = 1,
): PlacedBubble[] {
  const placed: PlacedBubble[] = [];
  const sorted = [...wishes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.y - a.y);
  for (const w of sorted) {
    const size = bubbleSize(w.text, w.maxWidth, w.meta, scale);
    const at = (tail: 'left' | 'right', lift: number): PlacedBubble | null => {
      const raw = tail === 'left' ? w.x - 12 : w.x + 12 - size.width;
      const left = Math.min(width - margin - size.width, Math.max(margin, raw));
      const top = Math.max(ceiling, w.y - size.height - lift);
      // Clamped under the ceiling it would come down over the critter: no room there.
      if (top + size.height > w.y) return null;
      const b: PlacedBubble = { key: w.key, left, top, tail, ...size };
      return placed.some((p) => overlaps(p, b)) ? null : b;
    };
    for (const lift of [0, size.height / 2 + GAP, size.height + GAP]) {
      const b = at('right', lift) ?? at('left', lift);
      if (b) {
        placed.push(b);
        break;
      }
    }
  }
  return placed;
}

/**
 * Where a critter's bubble sits: the top of its drawing, over the middle of it. The art's sprite
 * box is 1.55 sizes tall with the feet 0.08 above its bottom (`critterLayers`).
 */
export const headOf = (
  spot: { readonly x: number; readonly y: number; readonly size: number },
  width: number,
  height: number,
) => ({ x: width * spot.x, y: height * spot.y - width * spot.size * 1.47 });
