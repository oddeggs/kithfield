import { shopInks } from '@kithfield/theme';

import { type ProductKind } from './products';

/*
 * How the shop draws each item, the same scenes and stand-in critters as the app's shop
 * (`apps/mobile/src/features/shop/item-art.tsx`, which this can't import: it is a React Native
 * view): cottage styles are the `style` scene, companions `buddy`, coats `pose`, little things
 * `react` and sticker packs a cover `sticker`.
 */

const COMPANION_ON: Readonly<Record<string, string>> = {
  duckling: 'rabbit',
  snail: 'fox',
  moth: 'owl',
  butterfly: 'rabbit',
  bee: 'bear',
  ladybird: 'cat',
};
const COAT_ON: Readonly<Record<string, string>> = {
  calico: 'cat',
  golden: 'bear',
  frost: 'fox',
  aurora: 'fox',
  ember: 'bear',
  cloud: 'sheep',
  blossom: 'rabbit',
  mossy: 'frog',
};
/** Glowing companions sit on the shop's night tile. */
const NIGHT_COMPANIONS = new Set(['moth']);
const NIGHT_TILE = shopInks.day.nightTile;
const PACK_COVER: Readonly<Record<string, { kind: string; pose: string }>> = {
  out_and_about: { kind: 'rabbit', pose: 'kite' },
  big_feelings: { kind: 'sheep', pose: 'yay' },
  cosy_weather: { kind: 'rabbit', pose: 'umbrella' },
  birthday_bloom: { kind: 'bear', pose: 'cake' },
  good_luck: { kind: 'hedgehog', pose: 'clover' },
};
const COTTAGE_SEASON: Readonly<Record<string, string>> = { igloo: 'winter' };

export interface ItemScene {
  scene: string;
  attrs: Record<string, string>;
}

/** The scene that draws an item, at its full size (the try-on stage) or as a tile. */
export function itemScene(
  kind: ProductKind,
  item: string,
  season: string,
  onStage: boolean,
): ItemScene {
  switch (kind) {
    case 'cottage': {
      const attrs: Record<string, string> = { name: item, season: COTTAGE_SEASON[item] ?? season };
      // On the stage the person's critter stands beside it, as the try-on screen shows it.
      if (onStage) Object.assign(attrs, { kind: 'rabbit', outfit: 'scarf', ocolor: '#5E7F4A' });
      return { scene: 'style', attrs };
    }
    case 'companion':
      return {
        scene: 'buddy',
        attrs: {
          kind: COMPANION_ON[item] ?? 'rabbit',
          name: item,
          season,
          ...(NIGHT_COMPANIONS.has(item) ? { color: NIGHT_TILE } : {}),
        },
      };
    case 'coat':
      return {
        scene: 'pose',
        attrs: {
          kind: COAT_ON[item] ?? 'cat',
          coat: item,
          pose: 'awake',
          season,
          ...(item === 'calico' ? { mark: 'spots' } : {}),
        },
      };
    case 'little_thing': {
      const name = item === 'breezy_scarf' ? 'scarf' : item;
      return {
        scene: 'react',
        attrs: { name, season, ...(name === 'scarf' ? { kind: 'cat' } : {}) },
      };
    }
    case 'sticker_pack': {
      const cover = PACK_COVER[item] ?? { kind: 'rabbit', pose: 'wave' };
      return { scene: 'sticker', attrs: { kind: cover.kind, pose: cover.pose } };
    }
    case 'subscription':
    case 'founding':
    case 'gift':
    case 'chip_in':
      throw new Error(`${kind} is not an item`);
  }
}
