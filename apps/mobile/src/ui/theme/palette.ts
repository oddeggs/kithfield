import { day, glass, night, type Appearance } from '@kithfield/theme';

/**
 * The colours the component library paints with, by job, in each appearance. Palette colours come
 * from `@kithfield/theme`; the tints, hairlines and in-between inks the design writes inline in
 * `01 Foundations` (component library) and `12 States` (the farm and the chat at night) are named here.
 * Night values the design does not draw are taken from the night palette and listed in
 * `docs/undesigned-states.md`.
 */
export interface Palette {
  appearance: Appearance;
  /** Screen background. */
  background: string;
  /** Sheets over art. */
  sheet: string;
  /** The component library's panels, and anything grouped on the screen background. */
  panel: string;
  /** Cards, fields, their bubbles. */
  card: string;
  cardBorder: string;
  hairline: string;
  text: string;
  /** Paragraphs in sheets, empty states and fields' labels (`#5b5048`). */
  body: string;
  secondary: string;
  /** Inactive tabs and names over bubbles. */
  muted: string;
  placeholder: string;
  chevron: string;
  /** Ink-tinted fills: the secondary button, round buttons, icon tiles. */
  fillSoft: string;
  fillSecondary: string;
  primary: { bg: string; fg: string };
  go: { bg: string; fg: string };
  light: { bg: string; fg: string };
  destructive: { bg: string; fg: string };
  chip: {
    bg: string;
    fg: string;
    border: string;
    selectedBg: string;
    selectedFg: string;
    suggestionBg: string;
    suggestionFg: string;
    invitedBg: string;
  };
  segment: { track: string; thumb: string; shadow: string };
  toggle: { on: string; off: string; knob: string };
  bubble: {
    yoursBg: string;
    yoursFg: string;
    quietBg: string;
    quietRule: string;
    quietHead: string;
    failedBorder: string;
    failedText: string;
  };
  sheetShadow: string;
  grabber: string;
  tabBar: { fill: string; blurTint: 'light' | 'dark'; border: string; activeBg: string };
  tabActive: string;
  tabInactive: string;
  honey: string;
  dotRing: string;
  notice: { bg: string; fg: string };
  plan: { bg: string; border: string; eyebrow: string; detail: string; art: string };
  /** The firefly's night-blue tile, the same in both appearances. */
  firefly: { bg: string; fg: string; sub: string };
  /** The dewdrop's selected circle in the gesture tray. */
  dewdropTint: string;
  trayShadow: string;
  /** Text and dividers on the credit card. */
  creditText: string;
  glassButton: { fill: string; border: string };
}

const ink = (alpha: number) => `rgba(42,34,29,${alpha})`;
const white = (alpha: number) => `rgba(255,255,255,${alpha})`;

const firefly = { bg: '#2b2e4a', fg: night.moon, sub: '#cfc6d8' };

const dayPalette: Palette = {
  appearance: 'day',
  background: day.paper,
  sheet: day.sheet,
  panel: '#fbf7f0',
  card: day.card,
  cardBorder: ink(0.08),
  hairline: ink(0.08),
  text: day.ink,
  body: '#5b5048',
  secondary: day.ink3,
  muted: '#7d7168',
  placeholder: day.ink4,
  chevron: '#a0948a',
  fillSoft: ink(0.06),
  fillSecondary: ink(0.07),
  primary: { bg: day.ink, fg: day.paper },
  go: { bg: day.moss, fg: day.paper },
  light: { bg: day.honey, fg: day.ink },
  destructive: { bg: day.clay, fg: day.paper },
  chip: {
    bg: day.card,
    fg: day.ink,
    border: ink(0.12),
    selectedBg: day.ink,
    selectedFg: day.paper,
    suggestionBg: 'rgba(94,127,74,.12)',
    suggestionFg: '#3f5a31',
    invitedBg: day.mossTint,
  },
  segment: { track: '#EFE7DA', thumb: day.card, shadow: '0 1px 4px rgba(42,34,29,.18)' },
  toggle: { on: day.moss, off: ink(0.18), knob: '#ffffff' },
  bubble: {
    yoursBg: day.moss,
    yoursFg: '#fbf7f0',
    quietBg: '#fbf6ec',
    quietRule: 'rgba(95,127,74,.16)',
    quietHead: day.moss,
    failedBorder: '#c9734e',
    failedText: day.clay,
  },
  sheetShadow: '0 -8px 30px -14px rgba(60,40,20,.35)',
  grabber: ink(0.18),
  tabBar: {
    fill: glass.tabBarDay.fill,
    blurTint: 'light',
    border: glass.tabBarDay.border,
    activeBg: ink(0.08),
  },
  tabActive: day.ink,
  tabInactive: '#7d7168',
  honey: day.honey,
  dotRing: '#fbf7f0',
  notice: { bg: day.ink, fg: day.paper },
  plan: {
    bg: day.honeyTint,
    border: '#E9CF92',
    eyebrow: '#8a5a1c',
    detail: '#5b4a35',
    art: '#F3DDA9',
  },
  firefly,
  dewdropTint: '#E3EEF0',
  trayShadow: '0 14px 40px -16px rgba(40,25,10,.4)',
  creditText: '#3a302a',
  glassButton: { fill: glass.button.fill, border: glass.button.border },
};

const nightPalette: Palette = {
  appearance: 'night',
  background: night.sky,
  sheet: night.panel,
  panel: night.panel,
  card: night.bubble,
  cardBorder: white(0.08),
  hairline: white(0.1),
  text: night.moon,
  body: night.moon2,
  secondary: night.moon2,
  muted: night.dim,
  placeholder: '#9a93ab',
  chevron: '#a0948a',
  fillSoft: white(0.08),
  fillSecondary: white(0.1),
  primary: { bg: night.honey, fg: day.ink },
  go: { bg: day.moss, fg: night.moon },
  light: { bg: night.lamp, fg: day.ink },
  destructive: { bg: day.clay, fg: night.moon },
  chip: {
    bg: night.bubble,
    fg: night.moon,
    border: white(0.14),
    selectedBg: night.moon,
    selectedFg: night.sky,
    suggestionBg: 'rgba(169,196,142,.16)',
    suggestionFg: '#a9c48e',
    invitedBg: 'rgba(169,196,142,.16)',
  },
  segment: { track: white(0.08), thumb: night.bubble, shadow: '0 1px 4px rgba(0,0,0,.35)' },
  toggle: { on: day.moss, off: white(0.18), knob: '#ffffff' },
  bubble: {
    yoursBg: day.moss,
    yoursFg: '#fbf7f0',
    quietBg: '#2a3048',
    quietRule: 'rgba(169,196,142,.14)',
    quietHead: '#a9c48e',
    failedBorder: '#c9734e',
    failedText: '#e08a6c',
  },
  sheetShadow: '0 -8px 30px -14px rgba(0,0,0,.4)',
  grabber: white(0.3),
  tabBar: {
    fill: glass.tabBarNight.fill,
    blurTint: 'dark',
    border: glass.tabBarNight.border,
    activeBg: white(0.1),
  },
  tabActive: night.moon,
  tabInactive: night.dim,
  honey: night.honey,
  dotRing: '#2a2c48',
  notice: { bg: night.moon, fg: night.sky },
  plan: {
    bg: '#34385a',
    border: white(0.1),
    eyebrow: night.lamp,
    detail: night.moon2,
    art: '#2b2e4a',
  },
  firefly,
  dewdropTint: 'rgba(227,238,240,.16)',
  trayShadow: '0 14px 40px -16px rgba(0,0,0,.6)',
  creditText: night.moon2,
  glassButton: { fill: 'rgba(30,32,56,.5)', border: white(0.14) },
};

export const palettes: Readonly<Record<Appearance, Palette>> = {
  day: dayPalette,
  night: nightPalette,
};
