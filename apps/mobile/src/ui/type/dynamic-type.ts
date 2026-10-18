import type { Ramp } from './styles';

/**
 * React Native's own text scale per content size category (`RCTAccessibilityManager`), which it
 * reports as `fontScale` and scales text with no Dynamic Type ramp by: extra small to extra extra
 * extra large, then AX1 to AX5.
 */
const RN_FONT_SCALES = [
  0.823, 0.882, 0.941, 1.0, 1.118, 1.235, 1.353, 1.786, 2.143, 2.643, 3.143, 3.571,
] as const;

/** The point size of each iOS text style in every content size category, in the same order. */
const STYLE_SIZES: Readonly<Record<Ramp, readonly number[]>> = {
  largeTitle: [31, 32, 33, 34, 36, 38, 40, 44, 48, 52, 56, 60],
  title1: [25, 26, 27, 28, 30, 32, 34, 38, 43, 48, 53, 58],
  title2: [19, 20, 21, 22, 24, 26, 28, 34, 39, 44, 50, 56],
  title3: [17, 18, 19, 20, 22, 24, 26, 31, 37, 43, 49, 55],
  headline: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53],
  body: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53],
  callout: [13, 14, 15, 16, 18, 20, 22, 26, 32, 38, 44, 51],
  subheadline: [12, 13, 14, 15, 17, 19, 21, 25, 30, 36, 42, 49],
  footnote: [12, 12, 12, 13, 15, 17, 19, 23, 27, 33, 38, 44],
  caption1: [11, 11, 11, 12, 14, 16, 18, 22, 26, 32, 37, 43],
  caption2: [11, 11, 11, 11, 13, 15, 17, 20, 24, 29, 34, 40],
};

const LARGE = 3;

/** The content size category `fontScale` stands for, as an index into the tables above. */
function category(fontScale: number): number {
  let best = LARGE;
  RN_FONT_SCALES.forEach((s, i) => {
    if (Math.abs(s - fontScale) < Math.abs((RN_FONT_SCALES[best] ?? 1) - fontScale)) best = i;
  });
  return best;
}

export interface Scaling {
  /** The window's `fontScale`. */
  fontScale: number;
  /** The iOS text style the text follows, or null to scale with `fontScale`. */
  ramp: Ramp | null;
  allowFontScaling?: boolean | undefined;
  maxFontSizeMultiplier?: number | null | undefined;
}

/**
 * How much iOS enlarges a text's size and line height under Dynamic Type, as React Native works it
 * out: by its text style's own ratio when it has one (`UIFontMetrics`), by `fontScale` otherwise,
 * capped at `maxFontSizeMultiplier` when that is at least 1.
 */
export function fontSizeMultiplier({
  fontScale,
  ramp,
  allowFontScaling = true,
  maxFontSizeMultiplier,
}: Scaling): number {
  if (!allowFontScaling) return 1;
  const sizes = ramp === null ? null : STYLE_SIZES[ramp];
  const scale = sizes ? (sizes[category(fontScale)] ?? 1) / (sizes[LARGE] ?? 1) : fontScale;
  const max = maxFontSizeMultiplier ?? 0;
  return max >= 1 ? Math.min(max, scale) : scale;
}
