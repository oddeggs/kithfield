import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Spacing } from '@kithfield/theme';
import { scheduleOnRN } from 'react-native-worklets';

import { ArtIcon } from '../../../ui/art/art-view';
import { Glass } from '../../../ui/components/glass';
import { fadeTo, sheetTo } from '../../../ui/motion/motion';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
// The farm's short name, as the farm's own header shortens it.
import { shortName } from '../../farm/farm-copy';
import { useChatColours } from '../ui/chat-colours';
import { ANDROID_BACK, AndroidBackArrow } from '../../android/back-arrow';
import { foldClock, type FoldClock } from './header-fold';

/** How a chat's header sizes: its whole scene, and the plain strip it folds to. */
export interface HeaderSize {
  readonly full: number;
  readonly min: number;
}

/** The whole scene's height: the farm 236 points, the porch 300. */
export const FARM_HEADER = 236;
export const PORCH_HEADER = 300;
/** The chat's sheet overlaps the art by this much, its rounded corners over the farm. */
export const SHEET_OVERLAP = 16;
/** Between the bar and the chat's sheet once the header has folded. */
const BAR_GAP: Spacing = 12;

/** Where the bar over the art starts: just under the status bar. */
export function barTop(insetTop: number): number {
  return Math.max(insetTop - 1, 20);
}

/**
 * The folded header: only as tall as the status bar and the bar under it (back, title, the one
 * more button), then the sheet, with nothing of the scene left to look at.
 */
export function foldedHeight(insetTop: number, barHeight: number): number {
  return barTop(insetTop) + barHeight + BAR_GAP + SHEET_OVERLAP;
}

/** How far the chat scrolls before that counts as using it. */
const SCROLL_SLOP = 4;

/** A chat header's fold: its height, its art's opacity, and whether the whole farm shows. */
export interface HeaderFold {
  readonly height: SharedValue<number>;
  /**
   * The art's opacity: gone as the header folds, back as it opens. Under Reduce Motion the height
   * lands at once and the art fades instead.
   */
  readonly shown: SharedValue<number>;
  readonly open: boolean;
  /** Someone used the chat: fold the farm away. */
  readonly interact: () => void;
  /** The header was tapped: show the whole farm again, or fold it. */
  readonly toggle: () => void;
}

/**
 * The header shows its whole farm on the way in, then folds to a plain strip after a few seconds
 * or at the first use of the chat, the scene fading as it goes; a tap on it shows the farm again. While it's open, the first
 * points of a scroll still fold it under the finger, 1:1, as the farm's header always has.
 */
export function useHeaderFold(
  scrollY: SharedValue<number>,
  keyboard: SharedValue<number>,
  size: HeaderSize,
): HeaderFold {
  const reduce = useReduceMotion();
  const reader = useScreenReader();
  const fold = useSharedValue(0);
  // Where the chat was scrolled when the farm last opened: scrolling away from here folds it.
  const base = useSharedValue(0);
  const artIn = useSharedValue(1);
  const [open, setOpen] = useState(true);
  const reduced = useRef(reduce);
  reduced.current = reduce;
  const clock = useRef<FoldClock | null>(null);
  useEffect(() => {
    const c = foldClock((next) => {
      setOpen(next);
      if (next) base.set(scrollY.get());
      fold.set(sheetTo(next ? 0 : 1, reduced.current));
      artIn.set(reduced.current ? fadeTo(next ? 1 : 0) : next ? 1 : 0);
    });
    clock.current = c;
    return () => {
      c.dispose();
      clock.current = null;
    };
  }, [artIn, base, fold, scrollY]);
  useEffect(() => clock.current?.hold(reader), [reader]);
  const interact = useCallback(() => clock.current?.interact(), []);
  const toggle = useCallback(() => clock.current?.toggle(), []);
  useAnimatedReaction(
    () => Math.abs(scrollY.get() - base.get()) > SCROLL_SLOP,
    (moved, before) => {
      if (moved && before === false) scheduleOnRN(interact);
    },
  );
  useAnimatedReaction(
    () => keyboard.get() > 0.5,
    (up, before) => {
      if (up && before === false) scheduleOnRN(interact);
    },
  );
  // How far folded, 0 to 1: the fold itself, or the finger while it's open.
  const progress = useDerivedValue(() => {
    const span = size.full - size.min;
    if (span <= 0) return 0;
    const scrolled = Math.min(1, Math.max(0, (scrollY.get() - base.get()) / span));
    return Math.max(Math.min(1, Math.max(0, fold.get())), scrolled);
  });
  const height = useDerivedValue(() => size.full - (size.full - size.min) * progress.get());
  const shown = useDerivedValue(() => (reduce ? artIn.get() : 1 - progress.get()));
  return { height, shown, open, interact, toggle };
}

/** Whether VoiceOver or TalkBack is running, kept current. */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    void AccessibilityInfo.isScreenReaderEnabled().then(setOn);
    return () => sub.remove();
  }, []);
  return on;
}

/**
 * The art at the top of a chat. It folds keeping its bottom (where the critters stand) in view
 * and fades to the plain surface under it; the art moves, it is never redrawn. The art itself is the button that shows it again or folds
 * it, behind the bar's own buttons.
 */
export function HeaderArtFrame({
  fold,
  size,
  surface,
  label,
  hint,
  children,
}: {
  readonly fold: HeaderFold;
  readonly size: HeaderSize;
  /** The plain tone left once the scene has faded: its own sky, or the night's. */
  readonly surface: string;
  readonly label: string;
  readonly hint: string;
  readonly children: ReactNode;
}) {
  const { height, shown } = fold;
  const frame = useAnimatedStyle(() => ({ height: height.get() }));
  const art = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: height.get() - size.full }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          overflow: 'hidden',
          backgroundColor: surface,
        },
        frame,
      ]}
    >
      <Press
        onPress={fold.toggle}
        darken={false}
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ expanded: fold.open }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={art} pointerEvents="box-none">
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** A 44-point round button of glass over the art. */
export function GlassCircle({
  label,
  onPress,
  children,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  const colours = useChatColours();
  return (
    <Glass radius={22} fill={colours.glassFill} border={colours.glassBorder}>
      <Press
        onPress={onPress}
        radius={22}
        accessibilityLabel={label}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </Press>
    </Glass>
  );
}

/** The back chevron, drawn as the design writes it; Android's top app bar has its arrow. */
export function BackGlyph() {
  const { palette } = useTheme();
  if (ANDROID_BACK) return <AndroidBackArrow color={palette.text} />;
  return (
    <Txt
      variant="body"
      color={palette.text}
      style={{ fontSize: 26, marginTop: -3 }}
      importantForAccessibility="no"
    >
      ‹
    </Txt>
  );
}

/** The bar over a chat's art: back, the farm's name and who is out, and one more button. */
export function HeaderBar({
  title,
  subtitle,
  onBack,
  backLabel,
  onTitle,
  titleLabel,
  right,
  onHeight,
}: {
  readonly title: string;
  readonly subtitle: string;
  /** None where the chat list sits beside the chat rather than behind it (a large screen). */
  readonly onBack: (() => void) | null;
  readonly backLabel: string;
  readonly onTitle?: () => void;
  readonly titleLabel?: string;
  readonly right: { readonly icon: string; readonly label: string; readonly onPress: () => void };
  /** The bar's own height once laid out, which sizes the folded header. */
  readonly onHeight?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const colours = useChatColours();
  // At the accessibility sizes the title shortens to the farm's short name and stands alone
  // (`12 States`, AX5); VoiceOver still hears both in full.
  const ax = useAccessibilitySize();
  const pill = (
    <View style={{ paddingTop: 7, paddingBottom: 8, paddingHorizontal: 16, alignItems: 'center' }}>
      <Txt variant="displayS" numberOfLines={1} maxFontSizeMultiplier={2}>
        {ax ? shortName(title) : title}
      </Txt>
      {ax ? null : (
        <Txt
          variant="caption"
          color={palette.body}
          numberOfLines={1}
          style={{ fontSize: 12, marginTop: 2 }}
        >
          {subtitle}
        </Txt>
      )}
    </View>
  );
  const androidTitle = (
    <View>
      <Txt variant="displayS" numberOfLines={1} maxFontSizeMultiplier={2}>
        {ax ? shortName(title) : title}
      </Txt>
      {ax ? null : (
        <Txt variant="caption" color={palette.body} numberOfLines={1} style={{ fontSize: 13 }}>
          {subtitle}
        </Txt>
      )}
    </View>
  );
  return (
    <View
      pointerEvents="box-none"
      onLayout={onHeight ? (e) => onHeight(e.nativeEvent.layout.height) : undefined}
      style={{
        position: 'absolute',
        top: barTop(insets.top),
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      {onBack ? (
        <GlassCircle label={backLabel} onPress={onBack}>
          <BackGlyph />
        </GlassCircle>
      ) : (
        <View style={{ width: 44 }} />
      )}
      {Platform.OS === 'android' ? (
        // Android's top app bar (`14 Platforms`): the title starts after the arrow, on the art.
        <View style={{ flex: 1, minWidth: 0, paddingLeft: 6 }}>
          {onTitle ? (
            <Press
              onPress={onTitle}
              darken={false}
              accessibilityLabel={titleLabel ?? `${title}, ${subtitle}`}
            >
              {androidTitle}
            </Press>
          ) : (
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={`${title}, ${subtitle}`}
            >
              {androidTitle}
            </View>
          )}
        </View>
      ) : (
        <Glass
          radius={22}
          fill={colours.glassFill}
          border={colours.glassBorder}
          style={{ flexShrink: 1, minWidth: 0 }}
        >
          {onTitle ? (
            <Press
              onPress={onTitle}
              radius={22}
              accessibilityLabel={titleLabel ?? `${title}, ${subtitle}`}
            >
              {pill}
            </Press>
          ) : (
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={`${title}, ${subtitle}`}
            >
              {pill}
            </View>
          )}
        </Glass>
      )}
      <GlassCircle label={right.label} onPress={right.onPress}>
        <ArtIcon name={right.icon} size={right.icon === 'seeds' ? 24 : 22} color={palette.text} />
      </GlassCircle>
    </View>
  );
}
