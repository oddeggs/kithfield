import {
  critterLayers,
  type CritterLayer,
  type CritterLook,
  type CritterState,
} from '@kithfield/art';
import { Canvas, Image } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useArt } from './art-provider';
import type { ViewStyleProp } from '../style';

export interface AvatarProps {
  /** The critter kind (`rabbit`, `sheep`, `owl`…). */
  readonly kind: string;
  readonly look?: CritterLook;
  readonly state?: Exclude<CritterState, 'blink'>;
  readonly size: number;
  /** A ring in the surface's colour, as overlapping critters wear on cards. */
  readonly ring?: string;
  /** Who this is, for VoiceOver ("Bea"); omitted, the critter is decoration. */
  readonly label?: string;
  readonly style?: ViewStyleProp;
}

interface Placed {
  layer: CritterLayer;
  x: number;
  y: number;
}

/**
 * A person's critter in a circle, framed as the design's `avatar` scene frames it (head centred,
 * a little above the middle, on the critter's own tint), built from the critter's cached layers:
 * body and coat, marking, outfit and accessory, each drawn once and shared by every avatar.
 */
export function Avatar({ kind, look, state = 'open', size, ring, label, style }: AvatarProps) {
  const store = useArt();
  const { tint, placed } = useMemo(() => {
    const I = store.art.internals;
    const k = I.CR[kind] ? kind : 'rabbit';
    const def = I.CR[k];
    const az = typeof def?.['az'] === 'number' ? def['az'] : 1;
    const coatTint = look?.coat ? I.COATS[k]?.[look.coat]?.['tint'] : undefined;
    const dir = k === 'hedgehog' || k === 'sheep' ? -1 : 1;
    const critterSize = size * 1.6 * az;
    const layers = critterLayers(store.art, k, look ?? {}, {
      size: critterSize,
      state,
      dir,
      dpr: store.dpr,
    });
    const kk = Math.round(critterSize) / 100;
    const [hx, hy] = def?.head ?? [0, 0];
    const out: Placed[] = layers.map((layer) => ({
      layer,
      x: size / 2 - hx * kk * dir - layer.originX,
      y: size * 0.53 - hy * kk - layer.originY,
    }));
    return { tint: coatTint ?? def?.tint ?? '#fbf5ea', placed: out };
  }, [store, kind, look, state, size]);
  const circle = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessible={label !== undefined}
      {...(label === undefined ? {} : { accessibilityLabel: label, accessibilityRole: 'image' })}
      style={[circle, ring ? { boxShadow: `0 0 0 2px ${ring}` } : null, style]}
    >
      <View style={[circle, { overflow: 'hidden', backgroundColor: tint }]}>
        <Canvas style={{ width: size, height: size }}>
          {placed.map(({ layer, x, y }) => (
            <Image
              key={layer.key}
              image={layer.image}
              x={x}
              y={y}
              width={layer.width}
              height={layer.height}
            />
          ))}
        </Canvas>
      </View>
    </View>
  );
}
