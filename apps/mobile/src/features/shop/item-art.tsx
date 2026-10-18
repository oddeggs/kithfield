import type { SceneAttrs } from '@kithfield/art';
import { View } from 'react-native';
import type { Season, ShopItemKind, Species } from '@kithfield/contracts';

import { ArtStill } from '../../ui/art/art-view';
import { LayeredScene } from '../../ui/art/layered-scene';
import type { ViewStyleProp } from '../../ui/style';

/*
 * How each shop item is drawn, from the scenes `09 Shop and Plus` uses: cottage styles are the
 * `style` scene, companions `buddy`, coats `pose`, little things `react`, sticker packs `sticker`
 * and farm themes the `strip` in their season. Nothing is drawn by hand.
 */

/** The critter each companion and coat is shown on when it isn't on yours (as the design draws it). */
const COMPANION_ON: Readonly<Record<string, Species>> = {
  duckling: 'rabbit',
  snail: 'fox',
  moth: 'owl',
  butterfly: 'rabbit',
  bee: 'bear',
  ladybird: 'cat',
  firefly: 'mouse',
};
const COAT_ON: Readonly<Record<string, Species>> = {
  moonlit: 'cat',
  calico: 'cat',
  golden: 'bear',
  frost: 'fox',
  aurora: 'fox',
  ember: 'bear',
  cloud: 'sheep',
  starry: 'cat',
  blossom: 'rabbit',
  mossy: 'frog',
};
/** Companions that glow are drawn on the night tile. */
const NIGHT_COMPANIONS: ReadonlySet<string> = new Set(['moth', 'firefly']);
/** Each sticker pack's cover sticker. */
const PACK_COVER: Readonly<Record<string, { kind: Species; pose: string }>> = {
  out_and_about: { kind: 'rabbit', pose: 'kite' },
  big_feelings: { kind: 'sheep', pose: 'yay' },
  cosy_weather: { kind: 'rabbit', pose: 'umbrella' },
  birthday_bloom: { kind: 'bear', pose: 'cake' },
  good_luck: { kind: 'hedgehog', pose: 'clover' },
};
/** Each farm theme is drawn as the farm strip in the season it's made of. */
export const THEME_SEASON: Readonly<Record<string, Season>> = {
  seaside_cove: 'summer',
  cherry_valley: 'spring',
  snowy_hollow: 'winter',
  mountain_lake: 'autumn',
};
/** Seasonal cottages always show their own season. */
const COTTAGE_SEASON: Readonly<Record<string, Season>> = { igloo: 'winter' };

/** The night tile behind glowing companions (`#2b2e4a`). */
export const NIGHT_TILE = '#2b2e4a';

export interface ItemLook {
  readonly item: string;
  readonly kind: ShopItemKind;
  /** The person's own critter, to try it on them; else the design's critter for it. */
  readonly species?: Species;
  /** Night for cottage styles (lit windows, the lighthouse's beam). */
  readonly night?: boolean;
  readonly season: Season;
  /** The critter's outfit, for trying a cottage on beside them. */
  readonly outfit?: { readonly outfit: string; readonly color: string } | null;
  /** Draw without the scene's own background (a cut-out over a card). */
  readonly bare?: boolean;
  /** The tile colour a companion or coat is drawn on, over the scene's own. */
  readonly tile?: string;
}

/** The scene and attributes that draw an item. */
export function itemScene(look: ItemLook): { scene: string; attrs: SceneAttrs } {
  const { item, kind, season } = look;
  switch (kind) {
    case 'cottage': {
      const attrs: Record<string, string> = {
        name: item,
        season: COTTAGE_SEASON[item] ?? season,
        night: String(look.night === true),
      };
      if (look.species) attrs['kind'] = look.species;
      if (look.outfit) {
        attrs['outfit'] = look.outfit.outfit;
        attrs['ocolor'] = look.outfit.color;
      }
      return { scene: 'style', attrs };
    }
    case 'companion': {
      const attrs: Record<string, string> = {
        kind: look.species ?? COMPANION_ON[item] ?? 'rabbit',
        name: item,
        season,
      };
      if (NIGHT_COMPANIONS.has(item) && !look.bare) attrs['color'] = NIGHT_TILE;
      if (look.bare) attrs['color'] = 'none';
      if (look.tile) attrs['color'] = look.tile;
      return { scene: 'buddy', attrs };
    }
    case 'coat': {
      const attrs: Record<string, string> = {
        kind: look.species ?? COAT_ON[item] ?? 'cat',
        coat: item,
        pose: 'awake',
        season,
      };
      if (item === 'calico') attrs['mark'] = 'spots';
      if (look.bare) attrs['color'] = 'none';
      if (look.tile) attrs['color'] = look.tile;
      return { scene: 'pose', attrs };
    }
    case 'little_thing': {
      const attrs: Record<string, string> = { name: item, season };
      if (item === 'scarf') attrs['kind'] = look.species ?? 'cat';
      return { scene: 'react', attrs };
    }
    case 'sticker_pack': {
      const cover = PACK_COVER[item] ?? { kind: 'rabbit', pose: 'wave' };
      return { scene: 'sticker', attrs: { kind: look.species ?? cover.kind, pose: cover.pose } };
    }
    case 'theme':
      return { scene: 'strip', attrs: { season: THEME_SEASON[item] ?? season } };
  }
}

/**
 * An item, drawn. Still by default (lists of tiles mount no surfaces); `moving` loops only the
 * parts that move, on twos (the windmill's sails, the lighthouse's beam), as `LayeredScene` does.
 */
export function ItemArt({
  look,
  width,
  height,
  moving = false,
  style,
}: {
  readonly look: ItemLook;
  readonly width: number;
  readonly height: number;
  readonly moving?: boolean;
  readonly style?: ViewStyleProp;
}) {
  const { scene, attrs } = itemScene(look);
  return moving ? (
    <View style={[{ width, height }, style]}>
      <LayeredScene scene={scene} width={width} height={height} attrs={attrs} tolerance={8} />
    </View>
  ) : (
    <ArtStill
      scene={scene}
      width={width}
      height={height}
      attrs={attrs}
      t={1.2}
      {...(style ? { style } : {})}
    />
  );
}
