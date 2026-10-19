import { day, night, type Appearance } from './colour';
import { planColours } from './plans';
import { settingsInks } from './settings';

/**
 * The colours `design/07 Rhythm.dc.html` and the trading and weather screens of
 * `design/15 Farm and Field Guide.dc.html` write inline, by job. The design draws these screens by
 * day only; the night values come from the night palette and are listed in
 * `docs/undesigned-states.md`.
 */
export interface RhythmColours {
  /** The Sunday harvest card, its hand-lettered eyebrow, its body text and the rosette's box. */
  recapCard: string;
  recapEyebrow: string;
  recapBody: string;
  recapBox: string;
  /** The rose's "Water the bloom" button. */
  rose: { bg: string; fg: string };
  /** Text on a fruit-coloured button. */
  onFruit: string;
  /** Hand-lettered moss lines: the project's caption, "puddles are out", "Kit's at the gate". */
  hand: string;
  /** Moss chips at a friend's gate. */
  gateChip: { bg: string; fg: string };
  /** A scrapbook page, its tape, the shadow under it and under its taped snapshot. */
  page: string;
  tape: string;
  pageShadow: string;
  snapShadow: string;
  /** The weather's attribution row, and its "Other data sources" link. */
  attribution: string;
  attributionLink: string;
  /** A trade's crop card, the swap arrow and the note under the cards. */
  cropCard: string;
  swapArrow: string;
  tradeNote: string;
  /** The little pill over a moment's art ("Bea's birthday"), by day: the design's paper at 80%. */
  pill: string | null;
}

const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

const dayColours: RhythmColours = {
  recapCard: '#F3E7CC',
  recapEyebrow: settingsInks.day.keeperBadge.fg,
  recapBody: settingsInks.day.honeyNote.fg,
  recapBox: '#fbf3e2',
  rose: { bg: '#d0606e', fg: '#ffffff' },
  onFruit: '#ffffff',
  hand: day.moss,
  gateChip: { bg: rgba(day.moss, 0.12), fg: settingsInks.day.helperBadge.fg },
  page: '#fbf6ec',
  tape: rgba(day.honey, 0.45),
  pageShadow: '0 6px 16px -10px rgba(60,40,20,.5), 0 0 0 1px rgba(42,34,29,.06)',
  snapShadow: '0 2px 6px -2px rgba(0,0,0,.25)',
  attribution: rgba(day.ink, 0.045),
  attributionLink: day.ink2,
  cropCard: day.card,
  swapArrow: '#a0948a',
  tradeNote: day.ink2,
  pill: 'rgba(251,247,240,.8)',
};

const nightColours: RhythmColours = {
  recapCard: night.bubble,
  recapEyebrow: night.honey,
  recapBody: night.moon2,
  recapBox: night.panel,
  rose: { bg: '#d0606e', fg: '#ffffff' },
  onFruit: '#ffffff',
  hand: planColours.night.hand,
  gateChip: { bg: rgba(planColours.night.hand, 0.16), fg: night.moon },
  page: night.bubble,
  tape: rgba(night.honey, 0.4),
  pageShadow: '0 6px 16px -10px rgba(0,0,0,.6), 0 0 0 1px rgba(244,236,218,.08)',
  snapShadow: '0 2px 6px -2px rgba(0,0,0,.5)',
  attribution: rgba(night.moon, 0.06),
  attributionLink: night.moon2,
  cropCard: night.bubble,
  swapArrow: night.dim,
  tradeNote: night.moon2,
  pill: null,
};

export const rhythmColours: Readonly<Record<Appearance, RhythmColours>> = {
  day: dayColours,
  night: nightColours,
};

/**
 * Each signature crop's colour: the visited farm's fruit and the button to take some home. The
 * design draws plums; the others follow their fruit (logged in `docs/undesigned-states.md`).
 */
export const fruitColours: Readonly<Record<string, string>> = {
  plum: '#7b4a86',
  persimmon: '#b8592c',
  lemon: '#8f7a1f',
  fig: '#6e4a6b',
};

/** A signature crop's colour, or the gift plum for one this app doesn't know. */
export const fruitColour = (fruit: string | null): string =>
  (fruit !== null ? fruitColours[fruit] : undefined) ?? day.plum;
