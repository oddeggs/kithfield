/**
 * The two palettes from `design/01 Foundations.dc.html` (Colour), hex exactly as written there.
 * Keys are the design's names in camelCase (`ink-2` is `ink2`, `moss-tint` is `mossTint`).
 */
export const day = {
  /** Screen background. */
  paper: '#F5EEE2',
  /** Sheets over art. */
  sheet: '#F7F1E7',
  /** Cards, fields, bubbles. */
  card: '#FFFAF2',
  /** Text, primary button. */
  ink: '#2A221D',
  /** Body text. */
  ink2: '#4A3F37',
  /** Secondary text. */
  ink3: '#6B5F55',
  /** Placeholder. */
  ink4: '#857A70',
  /** Your bubbles, go. */
  moss: '#5E7F4A',
  /** Info panels. */
  mossTint: '#E6EDD8',
  /** Light, new, fire. Never text on paper. */
  honey: '#E8B44E',
  /** Highlights. */
  honeyTint: '#F8E9C7',
  /** Destructive actions and failed states only. */
  clay: '#B0482F',
  /** Gifts. */
  plum: '#7A5A8A',
} as const;

/** After local sunset, and in dark appearance. */
export const night = {
  /** Screen background. */
  sky: '#1B1F3D',
  /** Sheets, tab bar. */
  panel: '#23263F',
  /** Their bubbles, fields. */
  bubble: '#2F3352',
  /** Text. */
  moon: '#F4ECDA',
  /** Secondary text. */
  moon2: '#D9CFBD',
  /** Tertiary. */
  dim: '#A9A3B8',
  /** Window light, speaking. */
  lamp: '#FFD170',
  /** Primary on night. */
  honey: '#E8B44E',
} as const;

/**
 * The Material surfaces `design/14 Platforms.dc.html` draws for Android by day, which Foundations
 * has no swatch for. By night they take the night palette (`panel`, `bubble`).
 */
export const material = {
  /** The navigation bar. */
  navBar: '#F1EADD',
  /** The chosen destination's pill on the navigation bar. */
  navPill: '#DCE6C9',
  /** A home-screen widget's paper. */
  widgetPaper: '#FBF6EE',
} as const;

export type DayColour = keyof typeof day;
export type NightColour = keyof typeof night;
export type Appearance = 'day' | 'night';

/**
 * The roles whose day and night colours Foundations describes with the same job, for an
 * Any / Dark pair. Colours without a described counterpart (ink-2, ink-4, moss, clay, plum, lamp)
 * are used by name from `day` or `night`.
 */
export const roles = {
  background: { day: day.paper, night: night.sky },
  sheet: { day: day.sheet, night: night.panel },
  card: { day: day.card, night: night.bubble },
  text: { day: day.ink, night: night.moon },
  secondaryText: { day: day.ink3, night: night.moon2 },
  primary: { day: day.ink, night: night.honey },
} as const satisfies Record<string, Record<Appearance, string>>;

export type ColourRole = keyof typeof roles;

/** The colour a role takes in an appearance. */
export function colourFor(role: ColourRole, appearance: Appearance): string {
  return roles[role][appearance];
}

/** The design's swatch name (`ink-2`) as its token key (`ink2`). */
export function tokenKey(designName: string): string {
  return designName.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
