import type { CritterLook, CritterState } from '@kithfield/art';
import { Canvas, Image } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Image as RNImage, View } from 'react-native';

import type { ViewStyleProp } from '../style';
import { useArt, useAvatarUri } from './art-provider';
import type { AvatarRequest } from './art-store';

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
  /**
   * Draws the critter's layers on a live surface, for the rare avatar that moves them. Otherwise
   * the layers are composed once into a plain image, so long lists of critters stay cheap.
   */
  readonly live?: boolean;
  readonly style?: ViewStyleProp;
}

function LiveLayers({ req }: { readonly req: AvatarRequest }) {
  const store = useArt();
  const key = JSON.stringify(req);
  const placed = useMemo(() => store.avatarLayers(req), [store, key]);
  return (
    <Canvas style={{ width: req.size, height: req.size }}>
      {placed.map((l) => (
        <Image key={l.key} image={l.image} x={l.x} y={l.y} width={l.w} height={l.h} />
      ))}
    </Canvas>
  );
}

function StillLayers({ req }: { readonly req: AvatarRequest }) {
  const uri = useAvatarUri(req);
  return uri ? (
    <RNImage source={{ uri }} style={{ width: req.size, height: req.size }} fadeDuration={0} />
  ) : null;
}

/**
 * A person's critter in a circle, framed as the design's `avatar` scene frames it (head a little
 * above the middle, on the critter's own tint), built from the critter's cached layers: body and
 * coat, marking, outfit and accessory, each drawn once and shared by every avatar.
 */
export function Avatar({ kind, look, state, size, ring, label, live = false, style }: AvatarProps) {
  const store = useArt();
  const tint = store.avatarTint(kind, look?.coat);
  const req = { kind, size, ...(look ? { look } : {}), ...(state ? { state } : {}) };
  const circle = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      accessible={label !== undefined}
      {...(label === undefined ? {} : { accessibilityLabel: label, accessibilityRole: 'image' })}
      style={[circle, ring ? { boxShadow: `0 0 0 2px ${ring}` } : null, style]}
    >
      <View pointerEvents="none" style={[circle, { overflow: 'hidden', backgroundColor: tint }]}>
        {live ? <LiveLayers req={req} /> : <StillLayers req={req} />}
      </View>
    </View>
  );
}
