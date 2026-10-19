import { layout, radii, sizes } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../../ui/components/glass';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
import { useGestureRejections } from '../send';
import { leave } from './presentation';
import { useGestureColours } from './colours';
import { ANDROID_BACK, AndroidBackArrow } from '../../android/back-arrow';

/** Glass over art: night-blue over a night scene, paper over a day one. */
export type GlassTone = 'night' | 'day';

/** The round glass back button over art. */
export function GlassBack({
  tone,
  onPress,
}: {
  readonly tone: GlassTone;
  readonly onPress?: () => void;
}) {
  const { t } = useLocale();
  const gc = useGestureColours();
  const g = tone === 'night' ? gc.glassNight : gc.glassDay;
  const size = sizes.circle;
  return (
    <Press onPress={onPress ?? leave} radius={size / 2} accessibilityLabel={t('gestures.back')}>
      <Glass
        radius={size / 2}
        fill={g.fill}
        border={g.border}
        style={{ width: size, height: size }}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {ANDROID_BACK ? (
            <AndroidBackArrow color={g.ink} />
          ) : (
            <Txt variant="displayM" color={g.ink} style={{ marginTop: -3 }}>
              ‹
            </Txt>
          )}
        </View>
      </Glass>
    </Press>
  );
}

/** The glass pill naming whose window, door or cottage this is. */
export function GlassPill({ tone, label }: { readonly tone: GlassTone; readonly label: string }) {
  const gc = useGestureColours();
  const g = tone === 'night' ? gc.glassNight : gc.glassDay;
  return (
    <Glass
      radius={22}
      fill={g.fill}
      border={g.border}
      style={{ paddingTop: 7, paddingBottom: 8, paddingHorizontal: 16 }}
    >
      <Txt variant="buttonSmall" color={g.ink} accessibilityRole="header" numberOfLines={1}>
        {label}
      </Txt>
    </Glass>
  );
}

export interface SceneScreenProps {
  /** The art at the top, drawn at the screen's width and `artHeight` tall. */
  readonly art: (width: number) => ReactNode;
  readonly artHeight: number;
  /** Where the sheet's top edge sits, from the top of the screen (design points). */
  readonly sheetTop: number;
  readonly tone: GlassTone;
  /** The pill in the middle of the top bar, if any. */
  readonly title?: string;
  /** Drawn over the art, under the top bar (a hand-lettered line, say). */
  readonly overArt?: ReactNode;
  readonly children: ReactNode;
  /** Pinned to the bottom of the screen, over the sheet: the primary button. */
  readonly footer?: ReactNode;
  /** Side padding inside the sheet. */
  readonly padding?: number;
  /** Drawn over everything, in screen coordinates (something flying to the art). */
  readonly overlay?: ReactNode;
}

/**
 * A gesture told over a scene: the art full-bleed under the status bar, glass controls over it,
 * and a sheet holding the words and the choice. The sheet rides up with the keyboard on the UI
 * thread, so a field inside it stays in view.
 */
export function SceneScreen({
  art,
  artHeight,
  sheetTop,
  tone,
  title,
  overArt,
  children,
  footer,
  padding = 20,
  overlay,
}: SceneScreenProps) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const ax = useAccessibilitySize();
  useGestureRejections();
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboard.height.get() - insets.bottom) }],
  }));
  // The design sets the top bar 58 points down under a 59-point status bar.
  const top = Math.max(12, insets.top - 1);
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', left: 0, top: 0 }}>{art(width)}</View>
      <View
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: artHeight }}
        pointerEvents="none"
      >
        {overArt}
      </View>
      <View
        style={{
          position: 'absolute',
          top,
          left: 14,
          right: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 6,
        }}
      >
        <GlassBack tone={tone} />
        {title ? <GlassPill tone={tone} label={title} /> : null}
        <View style={{ width: sizes.circle }} />
      </View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: sheetTop,
            bottom: 0,
            backgroundColor: palette.sheet,
            borderTopLeftRadius: radii.sheet,
            borderTopRightRadius: radii.sheet,
            boxShadow: palette.sheetShadow,
            paddingTop: 10,
            paddingHorizontal: padding,
            gap: 12,
          },
          lift,
        ]}
      >
        <View
          style={{
            width: sizes.grabberWidth,
            height: sizes.grabberHeight,
            borderRadius: 3,
            backgroundColor: palette.grabber,
            alignSelf: 'center',
          }}
        />
        {ax ? (
          // At the accessibility sizes the words scroll clear of the button over them.
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              gap: 12,
              paddingBottom: (footer ? sizes.buttonLarge + layout.buttonBottom : 0) + 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </Animated.View>
      {footer ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: layout.marginButton,
              right: layout.marginButton,
              bottom: layout.buttonBottom,
            },
            lift,
          ]}
        >
          {footer}
        </Animated.View>
      ) : null}
      {overlay}
    </View>
  );
}
