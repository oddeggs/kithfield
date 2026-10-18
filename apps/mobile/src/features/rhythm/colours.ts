import { day, night, type Appearance } from '@kithfield/theme';

import { withAlpha } from '../farm/over-art';

/**
 * The colours `design/07 Rhythm.dc.html` and `design/15 Farm and Field Guide.dc.html` write
 * inline for the rhythm screens, beyond the palette, by job. The design draws these screens by
 * day only; the night values come from the night palette (logged in `docs/undesigned-states.md`).
 */
export interface RhythmColours {
  /** The Sunday harvest card, its hand-lettered eyebrow, its body text and the rosette's box. */
  recapCard: string;
  recapEyebrow: string;
  recapBody: string;
  recapBox: string;
  /** The rose's "Water the bloom" button. */
  rose: { bg: string; fg: string };
  /** Hand-lettered moss lines: the project's caption, "puddles are out", "Kit's at the gate". */
  hand: string;
  /** Moss chips at a friend's gate. */
  gateChip: { bg: string; fg: string };
  /** A scrapbook page, its tape and the shadow under it. */
  page: string;
  tape: string;
  pageShadow: string;
  /** The weather's attribution row. */
  attribution: string;
  /** A trade's crop card and the swap arrow. */
  cropCard: string;
  swapArrow: string;
}

const dayColours: RhythmColours = {
  recapCard: '#F3E7CC',
  recapEyebrow: '#8a5a1c',
  recapBody: '#5b4a35',
  recapBox: '#fbf3e2',
  rose: { bg: '#d0606e', fg: '#ffffff' },
  hand: day.moss,
  gateChip: { bg: withAlpha(day.moss, 0.12), fg: '#3f5a31' },
  page: '#fbf6ec',
  tape: withAlpha(day.honey, 0.45),
  pageShadow: '0 6px 16px -10px rgba(60,40,20,.5), 0 0 0 1px rgba(42,34,29,.06)',
  attribution: withAlpha(day.ink, 0.045),
  cropCard: day.card,
  swapArrow: '#a0948a',
};

const nightColours: RhythmColours = {
  recapCard: night.bubble,
  recapEyebrow: night.honey,
  recapBody: night.moon2,
  recapBox: night.panel,
  rose: { bg: '#d0606e', fg: '#ffffff' },
  hand: '#a9c48e',
  gateChip: { bg: withAlpha('#a9c48e', 0.16), fg: '#cfe0bd' },
  page: night.bubble,
  tape: withAlpha(night.honey, 0.4),
  pageShadow: '0 6px 16px -10px rgba(0,0,0,.6), 0 0 0 1px rgba(244,236,218,.08)',
  attribution: withAlpha(night.moon, 0.06),
  cropCard: night.bubble,
  swapArrow: night.dim,
};

export const rhythmColours = (appearance: Appearance): RhythmColours =>
  appearance === 'night' ? nightColours : dayColours;

/**
 * Each signature crop's colour: the visited farm's art (`fruit`) and the button to take some
 * home. The design draws plums; the others follow their fruit (logged as undesigned).
 */
export const FRUIT_COLOUR: Readonly<Record<string, string>> = {
  plum: '#7b4a86',
  persimmon: '#b8592c',
  lemon: '#8f7a1f',
  fig: '#6e4a6b',
};

export const fruitColour = (fruit: string | null): string =>
  (fruit && FRUIT_COLOUR[fruit]) ?? day.plum;
