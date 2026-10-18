import type { FarmState, PersonId } from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';
import { radii, sizes } from '@kithfield/theme';
import { Canvas, ColorMatrix, Image } from '@shopify/react-native-skia';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useArt, useArtStill } from '../../ui/art/art-provider';
import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { lookOf } from '../../ui/art/critter-look';
import type { Sender } from '../../ui/components/bubble';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useArtVisible } from '../../ui/motion/visibility';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import type { ViewStyleProp } from '../../ui/style';
import { nameOf } from '../farm/farm-copy';
import { heroTint, useGuideLook } from './guide-look';

/** Grey and faded: a plant the farm hasn't met yet, as a pencil sketch (`grayscale(1) opacity(.45)`). */
const SKETCH = (() => {
  const r = 0.2126;
  const g = 0.7152;
  const b = 0.0722;
  const a = 0.45;
  return [r, g, b, 0, 0, r, g, b, 0, 0, r, g, b, 0, 0, 0, 0, 0, a, 0];
})();

export interface PlantArt {
  readonly plant: string;
  readonly stage: number;
  readonly state?: string;
  readonly pot?: boolean;
  /** The paper behind the drawing; `none` for none, the art's own paper when left out. */
  readonly color?: string;
}

const attrsOf = ({ plant, stage, state, pot, color }: PlantArt) => ({
  name: plant,
  stage,
  ...(state ? { state } : {}),
  ...(pot ? { pot: true } : {}),
  ...(color ? { color } : {}),
});

/** A plant drawn once and shown as an image; a sketch draws it grey and faded. */
export function PlantTile({
  art,
  width,
  height = width,
  radius = 0,
  sketch = false,
  style,
}: {
  readonly art: PlantArt;
  readonly width: number;
  readonly height?: number;
  readonly radius?: number;
  readonly sketch?: boolean;
  readonly style?: ViewStyleProp;
}) {
  const box = [{ width, height, borderRadius: radius, overflow: 'hidden' as const }, style];
  if (sketch) {
    return (
      <View style={box} pointerEvents="none">
        <SketchStill art={art} width={width} height={height} />
      </View>
    );
  }
  return (
    <View style={box} pointerEvents="none">
      <ArtStill scene="plant" width={width} height={height} attrs={attrsOf(art)} />
    </View>
  );
}

function SketchStill({
  art,
  width,
  height,
}: {
  readonly art: PlantArt;
  readonly width: number;
  readonly height: number;
}) {
  const image = useArtStill({ scene: 'plant', width, height, attrs: attrsOf(art) });
  return (
    <Canvas style={{ width, height }}>
      <Image image={image} x={0} y={0} width={width} height={height}>
        <ColorMatrix matrix={SKETCH} />
      </Image>
    </Canvas>
  );
}

/**
 * A drawing that sways from its base on the UI thread: ±`degrees` over `periodMs`, slower when
 * the plant is napping. Still under Reduce Motion, on a hidden screen and in the background.
 */
export function Sway({
  degrees,
  periodMs,
  width,
  height,
  children,
  style,
}: {
  readonly degrees: number;
  readonly periodMs: number;
  readonly width: number;
  readonly height: number;
  readonly children: ReactNode;
  readonly style?: ViewStyleProp;
}) {
  const reduce = useReduceMotion();
  const visible = useArtVisible();
  const angle = useSharedValue(0);
  useEffect(() => {
    if (reduce || !visible) {
      cancelAnimation(angle);
      angle.set(0);
      return;
    }
    angle.set(-degrees);
    angle.set(
      withRepeat(
        withTiming(degrees, {
          duration: periodMs / 2,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.Never,
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(angle);
  }, [reduce, visible, degrees, periodMs, angle]);
  const sway = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.get()}deg` }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ width, height, transformOrigin: 'bottom' }, sway, style]}
    >
      {children}
    </Animated.View>
  );
}

/** The paper behind a plant's hero drawing, from its bloom colour (night plants on night blue). */
export function useHeroTint(plant: string): string {
  const store = useArt();
  const row = store.art.internals.PL[plant];
  if (row?.[0] === 'night') return '#2b2e4a';
  return heroTint(typeof row?.[2] === 'string' ? row[2] : '');
}

/** The round 44-point button at the top of a guide screen: ‹ back, or an icon from the art. */
export function RoundButton({
  label,
  onPress,
  icon,
  glass = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly icon?: string;
  /** Over art: the porch's pale glass. */
  readonly glass?: boolean;
}) {
  const { palette, appearance } = useTheme();
  const size = sizes.circle;
  const fill = glass
    ? appearance === 'night'
      ? palette.glassButton.fill
      : 'rgba(251,247,240,.82)'
    : palette.fillSoft;
  return (
    <Press
      onPress={onPress}
      radius={size / 2}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon ? (
        <ArtIcon name={icon} size={icon === 'search' ? 22 : 20} color={palette.text} />
      ) : (
        <Txt variant="chevron" color={palette.text} style={{ fontSize: 24, marginTop: -3 }}>
          ‹
        </Txt>
      )}
    </Press>
  );
}

/** The guide's book page: a cream card with its bound edge on the left, over the backdrop. */
export function BookPage({
  top,
  bottom,
  children,
}: {
  readonly top: number;
  readonly bottom: number;
  readonly children: ReactNode;
}) {
  const look = useGuideLook();
  return (
    <View
      style={{
        position: 'absolute',
        top,
        left: 14,
        right: 14,
        bottom,
        borderRadius: 26,
        backgroundColor: look.page,
        boxShadow: `${look.pageShadow}, inset 10px 0 0 ${look.spine}`,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

/** The sheet over a hero drawing, with its grabber: still, fixed in place. */
export function HeroSheet({
  top,
  children,
  style,
}: {
  readonly top: number;
  readonly children: ReactNode;
  readonly style?: ViewStyleProp;
}) {
  const { palette } = useTheme();
  const look = useGuideLook();
  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top,
          bottom: 0,
          backgroundColor: palette.sheet,
          borderTopLeftRadius: radii.sheet,
          borderTopRightRadius: radii.sheet,
          boxShadow: look.heroShadow,
          paddingTop: 10,
        },
        style,
      ]}
    >
      <View
        style={{
          alignSelf: 'center',
          width: sizes.grabberWidth,
          height: sizes.grabberHeight,
          borderRadius: 3,
          backgroundColor: palette.grabber,
        }}
      />
      {children}
    </View>
  );
}

/** A line of text with one bold phrase in it, as the catalogue words it. */
export function BoldLine({
  before,
  bold,
  after,
  variant,
  color,
  size,
  lineHeight,
}: {
  readonly before: string;
  readonly bold: string;
  readonly after: string;
  readonly variant: 'body' | 'caption';
  readonly color: string;
  readonly size: number;
  readonly lineHeight: number;
}) {
  return (
    <Txt variant={variant} multiline color={color} style={{ fontSize: size, lineHeight, flex: 1 }}>
      {before}
      {bold ? (
        <Txt variant={variant} color={color} style={{ fontWeight: '600' }}>
          {bold}
        </Txt>
      ) : null}
      {after}
    </Txt>
  );
}

/** A tappable row to another page, as the porch pot's scrapbook row draws it. */
export function LinkRow({
  icon,
  title,
  sub,
  onPress,
}: {
  readonly icon: string;
  readonly title: string;
  readonly sub: string;
  readonly onPress: () => void;
}) {
  const look = useGuideLook();
  return (
    <Press
      onPress={onPress}
      radius={18}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 18,
        backgroundColor: look.scrapbookRow.bg,
      }}
    >
      <ArtStill
        scene="icon"
        width={30}
        height={30}
        attrs={{ name: icon, ...(look.iconInk ? { color: look.iconInk } : {}) }}
      />
      <View style={{ flex: 1 }}>
        <Txt variant="rowTitle" multiline style={{ fontSize: 15.5, lineHeight: 18.6 }}>
          {title}
        </Txt>
        <Txt
          variant="caption"
          multiline
          color={look.scrapbookRow.sub}
          style={{ fontSize: 13, lineHeight: 16.9 }}
        >
          {sub}
        </Txt>
      </View>
      <Txt variant="chevron" color={look.scrapbookRow.chevron}>
        ›
      </Txt>
    </Press>
  );
}

/** Friends as the critter stack draws them, by name and critter. */
export function sendersOf(t: Translate, state: FarmState, people: readonly PersonId[]): Sender[] {
  return people.flatMap((person) => {
    const m =
      state.members.find((x) => x.person === person) ??
      state.former.find((x) => x.person === person);
    return m
      ? [{ name: nameOf(t, state, person), kind: m.critter.species, look: lookOf(m.critter) }]
      : [];
  });
}
