import { day, night, type Appearance } from './colour';
import { planColours } from './plans';
import { settingsInks } from './settings';

/**
 * The colours `design/15 Farm and Field Guide.dc.html` writes inline for the field guide, the
 * porch pot and the visit's scrapbook, by job. The design draws these screens by day only; the
 * night values come from the night palette and are listed in `docs/undesigned-states.md`.
 */
export interface FieldGuideColours {
  /** Behind the guide's book page. */
  backdrop: string;
  /** The book page, and its shadow with the bound edge (`spine`) drawn inset on the left. */
  page: string;
  spine: string;
  pageShadow: string;
  /** The hairline under each of the guide's rows. */
  rule: string;
  /** Ink for the design's icons: their own colours by day (null), moonlight at night. */
  iconInk: string | null;
  /** Paragraphs on a page. */
  paragraph: string;
  /** "found", the page eyebrow, the porch pot's bar. */
  found: string;
  /** The ring round the stage a plant has reached. */
  stageRing: string;
  growing: string;
  notYet: string;
  rareEyebrow: string;
  /** The moss note under the harvest basket. */
  note: { bg: string; fg: string };
  /** The row through to another page, as the porch pot's scrapbook row. */
  linkRow: { bg: string; sub: string; chevron: string };
  /** The porch pot's stage bar: an unreached step and its label. */
  bar: { off: string; label: string };
  /** The visit's scrapbook: a pressed card, its tape and shadow, a dashed card still to come. */
  scrap: { card: string; tape: string; dashed: string; date: string; shadow: string };
  /** The sheet over a hero drawing. */
  heroShadow: string;
  /** The round back button over art, and the names pill over the porch. */
  glassButton: string;
  porchPill: string;
  /** The farm drawn in each season. */
  seasonCardShadow: string;
}

const nightMoss = planColours.night.hand;

export const fieldGuideColours: Readonly<Record<Appearance, FieldGuideColours>> = {
  day: {
    backdrop: '#e9dcc4',
    page: '#fbf4e6',
    spine: '#e8d8bb',
    pageShadow: '0 10px 30px -12px rgba(60,40,20,.4), inset 10px 0 0 #e8d8bb',
    rule: 'rgba(42,34,29,.07)',
    iconInk: null,
    paragraph: day.ink2,
    found: day.moss,
    stageRing: `0 0 0 2px ${day.moss}`,
    growing: '#8a5a1c',
    notYet: '#8a8278',
    rareEyebrow: '#3f6f9a',
    note: { bg: settingsInks.day.info.bg, fg: settingsInks.day.info.fg },
    linkRow: { bg: '#F3E7CC', sub: settingsInks.day.honeyNote.fg, chevron: '#8a7a60' },
    bar: { off: 'rgba(42,34,29,.12)', label: settingsInks.day.settingsLabel },
    scrap: {
      card: '#fffaf0',
      tape: 'rgba(232,180,78,.45)',
      dashed: planColours.day.restingBorder,
      date: '#8a7a60',
      shadow: '0 6px 16px -10px rgba(60,40,20,.5)',
    },
    heroShadow: '0 -10px 40px -16px rgba(40,25,10,.45)',
    glassButton: 'rgba(251,247,240,.82)',
    porchPill: 'rgba(251,247,240,.86)',
    seasonCardShadow: '0 14px 30px -16px rgba(60,40,20,.45)',
  },
  night: {
    backdrop: night.sky,
    page: night.panel,
    spine: night.bubble,
    pageShadow: `0 10px 30px -12px rgba(0,0,0,.5), inset 10px 0 0 ${night.bubble}`,
    rule: 'rgba(255,255,255,.08)',
    iconInk: night.moon2,
    paragraph: night.moon2,
    found: nightMoss,
    stageRing: `0 0 0 2px ${nightMoss}`,
    growing: night.lamp,
    notYet: night.dim,
    rareEyebrow: '#9fc3e0',
    note: { bg: settingsInks.night.info.bg, fg: settingsInks.night.info.fg },
    linkRow: { bg: settingsInks.night.honeyNote.bg, sub: night.moon2, chevron: night.dim },
    bar: { off: 'rgba(255,255,255,.14)', label: night.dim },
    scrap: {
      card: night.bubble,
      tape: 'rgba(232,180,78,.45)',
      dashed: planColours.night.restingBorder,
      date: night.dim,
      shadow: '0 6px 16px -10px rgba(0,0,0,.6)',
    },
    heroShadow: '0 -10px 40px -16px rgba(0,0,0,.6)',
    glassButton: settingsInks.night.glass.fill,
    porchPill: settingsInks.night.glass.fill,
    seasonCardShadow: '0 14px 30px -16px rgba(0,0,0,.6)',
  },
};

/**
 * The washes behind the guide's hero drawings. They are the art's paper, so they stay the same
 * at night, when the night veil darkens the whole drawing.
 */
export const fieldGuideWashes = {
  /** Behind a plant's hero drawing, as the design paints its plant page. */
  hero: '#efe4f3',
  /** Night plants (the moonflower) on the art's night blue. */
  nightPlant: '#2b2e4a',
  /** A rare bloom's weather: rain as the design paints it, frost and gold to match. */
  rare: {
    rain_kissed: '#dfe6ea',
    frost_lace: '#e6edf1',
    sun_gold: '#f6ecd2',
  },
} as const;
