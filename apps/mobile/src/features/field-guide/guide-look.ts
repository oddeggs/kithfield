import { day, motion, night, type Appearance } from '@kithfield/theme';

import { useTheme } from '../../ui/theme/theme-provider';

/*
 * The field guide's own colours and motion, as `design/15 Farm and Field Guide.dc.html` writes
 * them inline. Day is the design's; night is taken from the night palette (logged in
 * `docs/undesigned-states.md`).
 */

export interface GuideLook {
  /** Behind the guide's book page. */
  backdrop: string;
  page: string;
  /** The page's bound edge. */
  spine: string;
  pageShadow: string;
  rule: string;
  /** Ink for the design's icons: their own colours by day, moonlight at night. */
  iconInk: string | null;
  /** Paragraphs on a page (`#4a3f37`). */
  paragraph: string;
  /** "found", the page eyebrow, the stage outline, the pot's bar. */
  found: string;
  growing: string;
  notYet: string;
  rareEyebrow: string;
  note: { bg: string; fg: string };
  scrapbookRow: { bg: string; sub: string; chevron: string };
  bar: { off: string; label: string };
  scrap: { card: string; tape: string; dashed: string; date: string; shadow: string };
  heroShadow: string;
}

const ink = (a: number) => `rgba(42,34,29,${a})`;
const white = (a: number) => `rgba(255,255,255,${a})`;

const looks: Readonly<Record<Appearance, GuideLook>> = {
  day: {
    backdrop: '#e9dcc4',
    page: '#fbf4e6',
    spine: '#e8d8bb',
    pageShadow: '0 10px 30px -12px rgba(60,40,20,.4)',
    rule: ink(0.07),
    iconInk: null,
    paragraph: day.ink2,
    found: day.moss,
    growing: '#8a5a1c',
    notYet: '#8a8278',
    rareEyebrow: '#3f6f9a',
    note: { bg: day.mossTint, fg: '#3f4d33' },
    scrapbookRow: { bg: '#F3E7CC', sub: '#5b4a35', chevron: '#8a7a60' },
    bar: { off: ink(0.12), label: '#7d7168' },
    scrap: {
      card: '#fffaf0',
      tape: 'rgba(232,180,78,.45)',
      dashed: ink(0.2),
      date: '#8a7a60',
      shadow: '0 6px 16px -10px rgba(60,40,20,.5)',
    },
    heroShadow: '0 -10px 40px -16px rgba(40,25,10,.45)',
  },
  night: {
    backdrop: night.sky,
    page: night.panel,
    spine: night.bubble,
    pageShadow: '0 10px 30px -12px rgba(0,0,0,.5)',
    rule: white(0.08),
    iconInk: night.moon2,
    paragraph: night.moon2,
    found: '#a9c48e',
    growing: night.lamp,
    notYet: night.dim,
    rareEyebrow: '#9fc3e0',
    note: { bg: 'rgba(169,196,142,.16)', fg: night.moon2 },
    scrapbookRow: { bg: '#34385a', sub: night.moon2, chevron: night.dim },
    bar: { off: white(0.14), label: night.dim },
    scrap: {
      card: night.bubble,
      tape: 'rgba(232,180,78,.45)',
      dashed: white(0.2),
      date: night.dim,
      shadow: '0 6px 16px -10px rgba(0,0,0,.6)',
    },
    heroShadow: '0 -10px 40px -16px rgba(0,0,0,.6)',
  },
};

export function useGuideLook(): GuideLook {
  return looks[useTheme().appearance];
}

/** The guide's motion, from the design's developer notes and the theme's breathing. */
export const guideMotion = {
  /** A season tab cross-fades the rows; the tiles hold still. */
  rowsFadeMs: 160,
  /** The hero plant sways ±2° on a 4-second loop; the porch pot ±1°. */
  sway: { degrees: 2, periodMs: 4000 },
  potSway: { degrees: 1 },
  /** A sleepy plant breathes slower, as a sleeping critter does. */
  sleepyPeriodMs: Math.round((4000 * motion.breath.asleepMs) / motion.breath.awakeMs),
  /** The basket fills one crop at a time. */
  basketStepMs: 150,
} as const;

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/** The pale wash behind a plant's hero drawing: its bloom colour, a fifth of the way from white. */
export function heroTint(bloom: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(bloom)) return day.sheet;
  const mixed = [0, 1, 2].map((i) => Math.round(255 + (channel(bloom, i) - 255) * 0.18));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The washes behind a rare bloom: rain as the design paints it, frost and gold to match. */
export const RARE_TINT = {
  rain_kissed: '#dfe6ea',
  frost_lace: '#e6edf1',
  sun_gold: '#f6ecd2',
} as const;
