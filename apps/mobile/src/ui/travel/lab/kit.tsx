import { radii } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ArtStill } from '../../art/art-view';
import { useTheme } from '../../theme/theme-provider';
import { TravelAnchor } from '../anchors';
import type { SpriteSpec } from '../sprite';

/** A critter standing, as the design's `pose` scene draws it (no backdrop). */
export const poseOf = (kind: string, size: number): SpriteSpec => ({ critter: kind, size });

/** A standing critter registered for travel, its feet at `x`, `y` of its parent. */
export function StandingCritter({
  id,
  kind,
  x,
  y,
  size,
}: {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}) {
  return (
    <TravelAnchor
      id={id}
      sprite={poseOf(kind, size)}
      pointerEvents="none"
      // The scene stands the critter's feet 86% of the way down.
      style={{ position: 'absolute', left: x - size / 2, top: y - size * 0.86, width: size }}
    >
      <ArtStill
        scene="pose"
        width={size}
        height={size}
        attrs={{ kind, pose: 'awake', color: 'none' }}
      />
    </TravelAnchor>
  );
}

/** The paper panel a chat sits on, with the sheet's corners. */
export function ChatPaper({
  top,
  children,
}: {
  readonly top: number;
  readonly children?: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top,
        bottom: 0,
        backgroundColor: palette.background,
        borderTopLeftRadius: radii.sheet,
        borderTopRightRadius: radii.sheet,
        boxShadow: palette.sheetShadow,
        paddingTop: 22,
        paddingHorizontal: 14,
        gap: 14,
      }}
    >
      {children}
    </View>
  );
}

/** A blank friend's bubble, as the storyboards sketch them. */
export function BlankBubble({ width }: { readonly width: number }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width,
        height: 44,
        borderRadius: 20,
        borderBottomLeftRadius: 6,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.cardBorder,
      }}
    />
  );
}
