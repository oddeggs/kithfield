import { radii } from '@kithfield/theme';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';

import { ArtStill } from '../../art/art-view';
import { Chip } from '../../components/chip';
import { useTheme } from '../../theme/theme-provider';
import { Txt } from '../../type/text';
import { TravelAnchor } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { useTravel, type FlightHandle, type FlightOptions } from '../travel-host';

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

/** The lab's stage: a phone-wide area the storyboard plays on. */
export const STAGE_W = 393;

export function LabStage({
  height = 600,
  background,
  children,
}: {
  readonly height?: number;
  readonly background?: string;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width: STAGE_W,
        height,
        overflow: 'hidden',
        backgroundColor: background ?? palette.background,
      }}
    >
      {children}
    </View>
  );
}

/** Under a stage: what to try, and the buttons that play it. */
export function LabNotes({
  hint,
  actions,
}: {
  readonly hint: string;
  readonly actions: readonly { readonly label: string; readonly onPress: () => void }[];
}) {
  const { palette } = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 10 }}>
      <Txt variant="note" multiline color={palette.secondary}>
        {hint}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {actions.map((a) => (
          <Chip key={a.label} label={a.label} onPress={a.onPress} />
        ))}
      </View>
    </View>
  );
}

/** One flight at a time for a demo: the handle while it flies, cleared when it ends. */
export function useLabFlight() {
  const travel = useTravel();
  const current = useRef<FlightHandle | null>(null);
  const go = (options: FlightOptions): FlightHandle => {
    const handle = travel.fly({
      ...options,
      onLanded: () => {
        if (current.current === handle) current.current = null;
        options.onLanded?.();
      },
      onReturned: () => {
        if (current.current === handle) current.current = null;
        options.onReturned?.();
      },
    });
    current.current = handle;
    return handle;
  };
  return { go, current, fly: travel.fly };
}
