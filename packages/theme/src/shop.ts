import { day, night, type Appearance } from './colour';

/**
 * The inks `09 Shop and Plus` writes inline, by job, in each appearance. Night values the design
 * doesn't draw come from the night palette (logged in `docs/undesigned-states.md`).
 */
export interface ShopInks {
  /** The round buttons over art (`rgba(251,247,240,.82)`). */
  glass: string;
  /** The day/night switch's track over art, and its selected thumb. */
  glassTrack: string;
  glassThumb: string;
  /** Item tiles and cards (`#fffaf2`). */
  tile: string;
  /** A tile's quiet border (`rgba(42,34,29,.12)`). */
  tileBorder: string;
  /** The price pill. */
  price: { bg: string; fg: string };
  /** The honey "patrons" pill. */
  patrons: { bg: string; fg: string };
  /** "yours" and the moss notes. */
  owned: { bg: string; fg: string };
  /** The moss info panel (`#E6EDD8` / `#3f4d33`). */
  info: { bg: string; fg: string; icon: string };
  /** The plum wish panel and button. */
  wish: { bg: string; fg: string; button: string };
  /** The honey set-reward panel. */
  reward: { bg: string; fg: string };
  /** Eyebrows: moss for the cart, honey-brown for patrons, plum for birthdays. */
  eyebrow: { moss: string; honey: string; plum: string; quiet: string };
  /** Body text in sheets (`#6b5f55`) and paragraphs (`#4a3f37`). */
  body: string;
  paragraph: string;
  /** Section labels (`#6b5f55`, upper case). */
  label: string;
  /** Hairlines between rows. */
  hairline: string;
  /** A chosen swatch's ring: the sheet's colour, then ink. */
  ringGap: string;
  ring: string;
  /** Progress bars: track and fill (moss for themes, plum for birthdays). */
  track: string;
  fillMoss: string;
  fillPlum: string;
  /** Bars of options not voted for. */
  fillQuiet: string;
  /** The patron's honey button and its ink. */
  honeyButton: { bg: string; fg: string };
  /** The secondary pill (`rgba(42,34,29,.07)`). */
  soft: { bg: string; fg: string };
  /** The dark primary pill (`#2a221d`). */
  ink: { bg: string; fg: string };
  /** The moss go pill. */
  go: { bg: string; fg: string };
  /** The patron card chosen: honey tint with a honey-brown ring. */
  chosen: { bg: string; border: string };
  /** The App Store disclosure panel (`rgba(42,34,29,.045)`). */
  disclosure: { bg: string; fg: string; strong: string };
  /** Links and the moss text buttons. */
  link: string;
  /** The destructive "Cancel in the App Store". */
  danger: { bg: string; fg: string };
  /** The kept / resting cards on the lapse screen. */
  kept: { bg: string; label: string; fg: string };
  resting: { bg: string; label: string; fg: string };
  /** The icon tiles on the patron's own view. */
  perkTile: string;
  /** The cork of the farmers' wall and its card. */
  cork: string;
  corkDot: string;
  wallCard: string;
  wallName: string;
  wallMine: { bg: string; fg: string };
  wallMore: string;
  /** The widget preview's night backdrop. */
  widgetSky: string;
  widgetBadge: { bg: string; fg: string };
  widgetName: string;
  /** The tag field under the wrappings. */
  field: { bg: string; border: string; placeholder: string };
  /** The book's shadow and cloths. */
  cloth: Readonly<Record<string, string>>;
  /** The five wrappings: paper and ribbon. */
  wraps: Readonly<Record<string, string>>;
  ribbon: string;
  /** The rounded art panel behind a gift (`#EFE2C8`). */
  giftStage: string;
  /** The rosy stage behind your critter on its card (`#F2E0D4`). */
  critterStage: string;
  /** A wrapping swatch's quiet edge (`inset 0 0 0 1px rgba(42,34,29,.15)`). */
  swatchEdge: string;
  /** The rule under each row of who chipped in (`rgba(42,34,29,.08)`). */
  rowRule: string;
  /** The patron screens: sparkles (`#c9973e`), chevrons at a row's end (`#b3a99f`), the lantern's
   * glow over the patron's cottage, and the vote's bar track (`rgba(42,34,29,.08)`). */
  sparkle: string;
  chevron: string;
  lanternGlow: string;
  barTrack: string;
  /** The widget preview, always at night: its sky glow, words, badge and buttons. */
  widgetPreview: {
    sky: string;
    glow: string;
    text: string;
    name: string;
    badge: { bg: string; fg: string };
    soft: { bg: string; fg: string };
  };
  /** Behind each piece's art on a matching set's card (`#f6efe3`). */
  setThumb: string;
  /** The empty ring of a set piece not yet owned (`rgba(42,34,29,.3)`). */
  checkRing: string;
  /** White on the plum wish button and the moss check (`#fff`). */
  onColour: string;
  /** The sheet's shadow over art (`0 -10px 40px -16px rgba(40,25,10,.45)`). */
  sheetShadow: string;
  /** The wall card's shadow on the cork (`0 10px 20px -10px rgba(0,0,0,.4)`). */
  cardShadow: string;
  /** The lantern glow's clear edge. */
  lanternGlowEdge: string;
  /** The night tile glowing companions are drawn on (`#2b2e4a`), the same in both appearances. */
  nightTile: string;
  /** The art's stand-in outfit when the person's critter isn't known (the design's moss scarf). */
  defaultOutfit: string;
}

const ink = (a: number) => `rgba(42,34,29,${a})`;
const white = (a: number) => `rgba(255,255,255,${a})`;

const cloth = { moss: '#7d8f6a', rose: '#c98a86', ink: '#4a5470', mustard: '#c9a24a' };
const wraps = {
  clay: '#D4704E',
  dusk: '#6F8FAA',
  fern: '#8FB768',
  brown_paper: '#E9D9BD',
  plum: '#7A5A8A',
};

const dayInks: ShopInks = {
  glass: 'rgba(251,247,240,.82)',
  glassTrack: 'rgba(251,247,240,.88)',
  glassThumb: day.card,
  tile: day.card,
  tileBorder: ink(0.12),
  price: { bg: ink(0.06), fg: day.ink },
  patrons: { bg: day.honeyTint, fg: '#8a5a1c' },
  owned: { bg: day.mossTint, fg: '#3f5a31' },
  info: { bg: day.mossTint, fg: '#3f4d33', icon: '#3f5a31' },
  wish: { bg: '#EFE4F3', fg: '#4A3A52', button: day.plum },
  reward: { bg: '#F8E9C7', fg: '#5b4a35' },
  eyebrow: { moss: day.moss, honey: '#8a5a1c', plum: day.plum, quiet: day.ink3 },
  body: day.ink3,
  paragraph: day.ink2,
  label: day.ink3,
  hairline: ink(0.1),
  ringGap: day.sheet,
  ring: day.ink,
  track: ink(0.1),
  fillMoss: day.moss,
  fillPlum: day.plum,
  fillQuiet: '#c8b8a4',
  honeyButton: { bg: day.honey, fg: day.ink },
  soft: { bg: ink(0.07), fg: day.ink },
  ink: { bg: day.ink, fg: day.paper },
  go: { bg: day.moss, fg: '#ffffff' },
  chosen: { bg: day.honeyTint, border: '#c9973e' },
  disclosure: { bg: ink(0.045), fg: '#5b5048', strong: day.ink },
  link: day.moss,
  danger: { bg: ink(0.07), fg: day.clay },
  kept: { bg: day.mossTint, label: '#3f5a31', fg: '#4a3f37' },
  resting: { bg: '#EFE7DA', label: day.ink3, fg: '#4a3f37' },
  perkTile: day.honeyTint,
  cork: '#c9a77f',
  corkDot: 'rgba(90,60,30,.16)',
  wallCard: '#fbf4e6',
  wallName: day.ink,
  wallMine: { bg: day.honeyTint, fg: '#8a5a1c' },
  wallMore: day.ink3,
  widgetSky: '#232745',
  widgetBadge: { bg: 'rgba(20,20,30,.55)', fg: night.lamp },
  widgetName: night.moon,
  field: { bg: day.card, border: ink(0.1), placeholder: day.ink4 },
  cloth,
  wraps,
  ribbon: '#F2C25A',
  giftStage: '#EFE2C8',
  critterStage: '#F2E0D4',
  swatchEdge: ink(0.15),
  rowRule: ink(0.08),
  sparkle: '#c9973e',
  chevron: '#b3a99f',
  lanternGlow: 'rgba(255,214,110,.55)',
  barTrack: ink(0.08),
  widgetPreview: {
    sky: night.panel,
    glow: '#3a3a5c',
    text: night.moon2,
    name: '#f6eedb',
    badge: { bg: 'rgba(0,0,0,.4)', fg: '#ffd98a' },
    soft: { bg: white(0.14), fg: night.moon },
  },
  setThumb: '#f6efe3',
  checkRing: ink(0.3),
  onColour: '#ffffff',
  sheetShadow: '0 -10px 40px -16px rgba(40,25,10,.45)',
  cardShadow: '0 10px 20px -10px rgba(0,0,0,.4)',
  lanternGlowEdge: 'rgba(255,214,110,0)',
  nightTile: '#2b2e4a',
  defaultOutfit: day.moss,
};

const nightInks: ShopInks = {
  glass: 'rgba(35,38,63,.82)',
  glassTrack: 'rgba(35,38,63,.88)',
  glassThumb: night.bubble,
  tile: night.bubble,
  tileBorder: white(0.12),
  price: { bg: white(0.1), fg: night.moon },
  patrons: { bg: 'rgba(232,180,78,.22)', fg: night.lamp },
  owned: { bg: 'rgba(94,127,74,.3)', fg: '#cfe0bd' },
  info: { bg: 'rgba(94,127,74,.24)', fg: night.moon2, icon: '#cfe0bd' },
  wish: { bg: 'rgba(122,90,138,.3)', fg: night.moon2, button: day.plum },
  reward: { bg: 'rgba(232,180,78,.18)', fg: night.moon2 },
  eyebrow: { moss: '#a9c48e', honey: night.lamp, plum: '#c9a8d8', quiet: night.moon2 },
  body: night.moon2,
  paragraph: night.moon2,
  label: night.dim,
  hairline: white(0.1),
  ringGap: night.panel,
  ring: night.moon,
  track: white(0.12),
  fillMoss: '#7f9f69',
  fillPlum: '#a07ab2',
  fillQuiet: white(0.3),
  honeyButton: { bg: night.honey, fg: day.ink },
  soft: { bg: white(0.1), fg: night.moon },
  ink: { bg: night.honey, fg: day.ink },
  go: { bg: day.moss, fg: night.moon },
  chosen: { bg: 'rgba(232,180,78,.16)', border: night.honey },
  disclosure: { bg: white(0.06), fg: night.moon2, strong: night.moon },
  link: '#a9c48e',
  danger: { bg: white(0.08), fg: '#e58a72' },
  kept: { bg: 'rgba(94,127,74,.24)', label: '#cfe0bd', fg: night.moon2 },
  resting: { bg: white(0.06), label: night.dim, fg: night.moon2 },
  perkTile: 'rgba(232,180,78,.18)',
  cork: '#6b5440',
  corkDot: 'rgba(0,0,0,.2)',
  wallCard: night.bubble,
  wallName: night.moon,
  wallMine: { bg: 'rgba(232,180,78,.22)', fg: night.lamp },
  wallMore: night.dim,
  widgetSky: '#232745',
  widgetBadge: { bg: 'rgba(20,20,30,.55)', fg: night.lamp },
  widgetName: night.moon,
  field: { bg: night.bubble, border: white(0.1), placeholder: night.dim },
  cloth,
  wraps,
  ribbon: '#F2C25A',
  giftStage: '#3a3550',
  critterStage: night.bubble,
  swatchEdge: white(0.15),
  rowRule: white(0.08),
  sparkle: night.honey,
  chevron: night.dim,
  lanternGlow: 'rgba(255,214,110,.55)',
  barTrack: white(0.12),
  widgetPreview: {
    sky: night.panel,
    glow: '#3a3a5c',
    text: night.moon2,
    name: '#f6eedb',
    badge: { bg: 'rgba(0,0,0,.4)', fg: '#ffd98a' },
    soft: { bg: white(0.14), fg: night.moon },
  },
  setThumb: white(0.06),
  checkRing: white(0.3),
  onColour: '#ffffff',
  sheetShadow: '0 -8px 30px -14px rgba(0,0,0,.4)',
  cardShadow: '0 10px 20px -10px rgba(0,0,0,.4)',
  lanternGlowEdge: 'rgba(255,214,110,0)',
  nightTile: '#2b2e4a',
  defaultOutfit: day.moss,
};

export const shopInks: Readonly<Record<Appearance, ShopInks>> = { day: dayInks, night: nightInks };

/**
 * The shop's own timings: the cart rolling in once per visit (900 ms, on twos), a farm theme
 * cross-fading in (1.2 s), the patron's lantern glow breathing (3 s a breath), and how long the app
 * waits between asking the server whether a purchase has landed.
 */
export const shopMotion = {
  cartRollMs: 900,
  themeFadeMs: 1200,
  lanternBreathMs: 3000,
  landingWaitMs: 1500,
} as const;
