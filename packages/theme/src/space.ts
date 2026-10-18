/**
 * Spacing, radii and the component sizes from `design/01 Foundations.dc.html` (Spacing and radii,
 * Component library). All values are points.
 */

/** The spacing scale. */
export const spacing = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 34] as const;
export type Spacing = (typeof spacing)[number];

/** Screen margins and gaps. */
export const layout = {
  /** Screen margin beside lists. */
  marginList: 16,
  /** Screen margin beside titles. */
  marginTitle: 20,
  /** Screen margin beside bottom buttons. */
  marginButton: 24,
  /** Bottom buttons sit this far from the bottom edge. */
  buttonBottom: 34,
  /** Gap between stacked cards: 10 to 12. */
  cardGapMin: 10,
  cardGapMax: 12,
  /** Hit targets never go below this. */
  minHitTarget: 44,
  /** Side padding inside a standard sheet. */
  sheetPadding: 18,
} as const;

/** Corner radii, named by what wears them. */
export const radii = {
  bubbleTail: 6,
  /** Small chips and tiles. */
  tile: 12,
  field: 16,
  card: 22,
  button: 28,
  sheet: 30,
  insetSheet: 44,
  device: 56,
} as const;

/** A pill's radius: always half its height. */
export function pill(height: number): number {
  return height / 2;
}

/** Component sizes from the component library. */
export const sizes = {
  buttonLarge: 56,
  buttonMedium: 48,
  buttonSmall: 36,
  /** Round icon buttons. */
  circle: 44,
  chip: 34,
  /** The floating glass tab bar. */
  tabBar: 64,
  grabberWidth: 36,
  grabberHeight: 5,
} as const;

/** Press state for anything tappable: scale and darken over a short ease. */
export const press = {
  scale: 0.97,
  /** Fraction darker than the resting colour. */
  darken: 0.08,
  durationMs: 90,
} as const;

/** Shadows as CSS box-shadow strings, as drawn (React Native's `boxShadow` takes them as is). */
export const shadows = {
  sheet: '0 -8px 30px -14px rgba(60,40,20,.35)',
  tabBar: '0 10px 30px -12px rgba(60,40,20,.35)',
  tray: '0 14px 40px -16px rgba(40,25,10,.4)',
  segment: '0 1px 4px rgba(42,34,29,.18)',
} as const;

/** Glass chrome over art: fill, backdrop blur (points), saturation and hairline border. */
export const glass = {
  tabBarDay: {
    fill: 'rgba(251,247,240,.84)',
    blur: 20,
    saturate: 1.5,
    border: 'rgba(255,255,255,.7)',
  },
  tabBarNight: {
    fill: 'rgba(30,32,56,.72)',
    blur: 20,
    saturate: 1,
    border: 'rgba(255,255,255,.12)',
  },
  button: {
    fill: 'rgba(251,247,240,.78)',
    blur: 18,
    saturate: 1.4,
    border: 'rgba(255,255,255,.6)',
  },
} as const;
