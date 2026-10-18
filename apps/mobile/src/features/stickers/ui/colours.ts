import { day, night, type Appearance } from '@kithfield/theme';

import { useTheme } from '../../../ui/theme/theme-provider';
import type { PackId } from '../model/catalogue';

/*
 * The sticker screens' own colours, as `08 Stickers` and `10 On the System` write them. Night
 * keeps each pack's hue as a deep wash over the night panel (`12 States`, Night).
 */

export interface StickerColours {
  /** Each pack's card in the shop, and its strip on the gift screen. */
  readonly pack: Readonly<Record<PackId, string>>;
  /** Behind a gift opening. */
  readonly openedBg: string;
  /** The stripes on a wrapping swatch. */
  readonly stripe: string;
  /** Words in a card's note. */
  readonly noteText: string;
  /** Behind a sticker shown bigger. */
  readonly scrim: string;
  /** A tab that is picked in the picker. */
  readonly tabOn: string;
  /** The picker's Shop pill. */
  readonly pill: string;
  /** The round gift button on a shop card. */
  readonly giftButton: string;
  /** Gifts: the eyebrow and the Wrap it up button. */
  readonly gift: string;
  readonly giftFg: string;
  /** The ring around a picked face. */
  readonly ring: string;
  /** Names under faces that aren't picked. */
  readonly faceName: string;
  /** "a gift from" on the opened gift. */
  readonly giftFrom: string;
  /** The opened gift's warm glow behind the parcel. */
  readonly glow: string;
  /** The export screen's preview card behind your pack. */
  readonly preview: string;
  /** App tiles on the export and adding screens. */
  readonly messagesTile: string;
  readonly telegramTile: string;
  readonly whatsappTile: string;
  readonly photosTile: string;
  readonly tileIcon: string;
  /** "On" for Messages. */
  readonly onBg: string;
  readonly onBorder: string;
  readonly onFg: string;
  /** "Pack ready". */
  readonly ready: string;
  /** The secondary Done button. */
  readonly soft: string;
  /** Wrapping papers by their art id. */
  readonly wraps: Readonly<Record<string, string>>;
}

const wraps = {
  clay: '#d4704e',
  dusk: '#6f8faa',
  fern: '#8fb768',
  honey: '#e8b44e',
  brown_paper: '#e9d9bd',
  plum: '#7a5a8a',
} as const;

const dayColours: StickerColours = {
  pack: {
    mine: '#F2E0D4',
    big_feelings: '#E6DDE4',
    cosy_weather: '#E3E8EC',
    birthday_bloom: '#F3E0E0',
    good_luck: '#E2EAD0',
    out_and_about: '#F3E7CF',
  },
  openedBg: '#F6ECDD',
  stripe: 'rgba(255,255,255,.28)',
  noteText: day.ink2,
  scrim: 'rgba(42,34,29,.28)',
  tabOn: 'rgba(42,34,29,.1)',
  pill: 'rgba(42,34,29,.07)',
  giftButton: 'rgba(255,255,255,.6)',
  gift: day.plum,
  giftFg: '#ffffff',
  ring: day.ink,
  faceName: '#7d7168',
  giftFrom: '#b0482f',
  glow: 'rgba(248,233,199,.9)',
  preview: '#F2E0D4',
  messagesTile: day.moss,
  telegramTile: '#5f8fb5',
  whatsappTile: '#5d8a5a',
  photosTile: 'rgba(42,34,29,.07)',
  tileIcon: '#ffffff',
  onBg: day.mossTint,
  onBorder: 'rgba(42,34,29,.12)',
  onFg: '#3f5a31',
  ready: day.moss,
  soft: 'rgba(42,34,29,.07)',
  wraps,
};

const nightColours: StickerColours = {
  pack: {
    mine: '#3a3350',
    big_feelings: '#3b3354',
    cosy_weather: '#2f3a52',
    birthday_bloom: '#43334a',
    good_luck: '#33403f',
    out_and_about: '#423c45',
  },
  openedBg: night.sky,
  stripe: 'rgba(255,255,255,.22)',
  noteText: night.moon2,
  scrim: 'rgba(10,12,30,.5)',
  tabOn: 'rgba(244,236,218,.12)',
  pill: 'rgba(244,236,218,.1)',
  giftButton: 'rgba(244,236,218,.12)',
  gift: '#a88bb8',
  giftFg: night.sky,
  ring: night.honey,
  faceName: night.dim,
  giftFrom: '#e39a7f',
  glow: 'rgba(255,209,112,.18)',
  preview: '#3a3350',
  messagesTile: day.moss,
  telegramTile: '#5f8fb5',
  whatsappTile: '#5d8a5a',
  photosTile: 'rgba(244,236,218,.1)',
  tileIcon: '#ffffff',
  onBg: 'rgba(143,183,104,.18)',
  onBorder: 'rgba(143,183,104,.35)',
  onFg: '#a9c98a',
  ready: '#a9c98a',
  soft: 'rgba(244,236,218,.1)',
  wraps,
};

export const stickerColours: Readonly<Record<Appearance, StickerColours>> = {
  day: dayColours,
  night: nightColours,
};

/** The sticker screens' colours in the appearance the app is in. */
export function useStickerColours(): StickerColours {
  return stickerColours[useTheme().palette.appearance];
}
