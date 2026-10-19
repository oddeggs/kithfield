import { farm, radii, sizes } from '@kithfield/theme';
import { Canvas, Image } from '@shopify/react-native-skia';
import { useEffect, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { useArtLoop } from '../../ui/art/art-provider';
import { ArtStill } from '../../ui/art/art-view';
import { Glass } from '../../ui/components/glass';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useArtVisible } from '../../ui/motion/visibility';
import { useTheme } from '../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { Txt } from '../../ui/type/text';
import type { ViewStyleProp } from '../../ui/style';
import { withAlpha } from './over-art';

/**
 * The resting sheet of a full-screen farm moment (move-in, leaving, a dozing cottage): the
 * sheet's look over the art, fixed in place.
 */
export function Panel({
  top,
  children,
  style,
}: {
  readonly top: number;
  readonly children: ReactNode;
  readonly style?: ViewStyleProp;
}) {
  const { palette } = useTheme();
  const ax = useAccessibilitySize();
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
          boxShadow: palette.sheetShadow,
          paddingHorizontal: 18,
          paddingTop: 10,
          gap: 12,
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
      {ax ? (
        // At the accessibility sizes the words outgrow the resting sheet: they scroll.
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 12, flexGrow: 1, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}

/** A scene across the top of a moment, drawn once. */
export function SceneArt({
  scene,
  width,
  height,
  attrs,
  t,
}: {
  readonly scene: string;
  readonly width: number;
  readonly height: number;
  readonly attrs: Record<string, string | number | boolean | undefined>;
  readonly t?: number;
}) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      <ArtStill
        scene={scene}
        width={width}
        height={height}
        attrs={attrs}
        {...(t === undefined ? {} : { t })}
      />
      <NightVeil width={width} height={height} />
    </View>
  );
}

/**
 * Night over a scene that has no night of its own (the valley, the crowd, the moments): the
 * farm's own night pass, a multiply of the night sky over the drawing. Nothing by day.
 */
export function NightVeil({ width, height }: { readonly width: number; readonly height: number }) {
  const { appearance } = useTheme();
  if (appearance !== 'night') return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        backgroundColor: withAlpha(farm.night.color, farm.night.strength),
        mixBlendMode: 'multiply',
      }}
    />
  );
}

/** The round glass button over a moment's art, with the design's glyph: ‹ back or ✕ close. */
export function GlyphButton({
  glyph,
  label,
  side,
  top,
  onPress,
}: {
  readonly glyph: '‹' | '✕';
  readonly label: string;
  readonly side: 'left' | 'right';
  readonly top: number;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const size = sizes.circle;
  return (
    <View style={{ position: 'absolute', top, [side]: 16 }}>
      <Press
        onPress={onPress}
        radius={size / 2}
        accessibilityLabel={label}
        accessibilityRole="button"
      >
        <Glass
          radius={size / 2}
          fill={palette.glassButton.fill}
          border={palette.glassButton.border}
          style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt
            variant="chevron"
            color={palette.text}
            style={glyph === '‹' ? { fontSize: 26, marginTop: -3 } : { fontSize: 20 }}
          >
            {glyph}
          </Txt>
        </Glass>
      </Press>
    </View>
  );
}

/**
 * A full-width scene playing on twos for a short celebration. Looped whole at the phone's density
 * a scene is over the art's budget, so the loop is drawn at `dpr` and laid over the crisp still.
 */
export function SceneLoop({
  scene,
  width,
  height,
  attrs,
  dpr,
}: {
  readonly scene: string;
  readonly width: number;
  readonly height: number;
  readonly attrs: Record<string, string | number | boolean | undefined>;
  readonly dpr: number;
}) {
  const reduce = useReduceMotion();
  const visible = useArtVisible();
  const loop = useArtLoop({ scene, width, height, dpr, attrs }, reduce);
  const elapsed = useSharedValue(0);
  const frames = loop?.frames ?? [];
  const fps = loop?.fps ?? 12;
  const clock = useFrameCallback((info) => {
    elapsed.set(info.timeSinceFirstFrame);
  }, false);
  useEffect(() => {
    clock.setActive(visible && !reduce && frames.length > 1);
  }, [clock, visible, reduce, frames.length]);
  const image = useDerivedValue(() => {
    const n = frames.length;
    return n === 0 ? null : (frames[Math.floor((elapsed.get() / 1000) * fps) % n] ?? null);
  });
  if (frames.length === 0) return null;
  return (
    <Canvas style={{ position: 'absolute', top: 0, left: 0, width, height }} pointerEvents="none">
      <Image image={image} x={0} y={0} width={width} height={height} />
    </Canvas>
  );
}
