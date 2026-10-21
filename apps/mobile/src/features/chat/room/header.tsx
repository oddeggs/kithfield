import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** How a chat's header sizes: the farm 236 points tall shrinking to 150, the porch 300 to 170. */
export interface HeaderSize {
  readonly full: number;
  readonly min: number;
}

export const FARM_HEADER: HeaderSize = { full: 236, min: 150 };
export const PORCH_HEADER: HeaderSize = { full: 300, min: 170 };
/** The chat's sheet overlaps the art by this much, its rounded corners over the farm. */
export const SHEET_OVERLAP = 16;

/** How far the chat scrolls before that counts as using it. */
const SCROLL_SLOP = 4;

/** A chat header's fold: its height, its art's opacity, and whether the whole farm shows. */
export interface HeaderFold {
  readonly height: SharedValue<number>;
  /** The art's opacity: under Reduce Motion the fold lands at once and the art fades back in. */
  readonly shown: SharedValue<number>;
  readonly open: boolean;
  /** Someone used the chat: fold the farm away. */
  readonly interact: () => void;
  /** The header was tapped: show the whole farm again, or fold it. */
  readonly toggle: () => void;
}

/**
 * The header shows its whole farm on the way in, then folds to the strip after a few seconds or
 * at the first use of the chat; a tap on it shows the farm again. While it's open, the first
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
  const shown = useSharedValue(1);
  const [open, setOpen] = useState(true);
  const reduced = useRef(reduce);
  reduced.current = reduce;
  const clock = useRef<FoldClock | null>(null);
  useEffect(() => {
    const c = foldClock((next) => {
      setOpen(next);
      if (next) base.set(scrollY.get());
      fold.set(sheetTo(next ? 0 : 1, reduced.current));
      if (reduced.current) shown.set(withSequence(withTiming(0, { duration: 0 }), fadeTo(1)));
    });
    clock.current = c;
    return () => {
      c.dispose();
      clock.current = null;
    };
  }, [base, fold, scrollY, shown]);
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
  const height = useDerivedValue(() => {
    const span = size.full - size.min;
    if (span <= 0) return size.full;
    const scrolled = Math.min(1, Math.max(0, (scrollY.get() - base.get()) / span));
    const folded = Math.min(1, Math.max(0, fold.get()));
    return size.full - span * Math.max(folded, scrolled);
  });
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
 * The art at the top of a chat. It folds keeping its bottom (where the critters stand) in view;
 * the art moves, it is never redrawn. The art itself is the button that shows it again or folds
 * it, behind the bar's own buttons.
 */
export function HeaderArtFrame({
  fold,
  size,
  label,
  hint,
  children,
}: {
  readonly fold: HeaderFold;
  readonly size: HeaderSize;
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
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' }, frame]}
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
}: {
  readonly title: string;
  readonly subtitle: string;
  /** None where the chat list sits beside the chat rather than behind it (a large screen). */
  readonly onBack: (() => void) | null;
  readonly backLabel: string;
  readonly onTitle?: () => void;
  readonly titleLabel?: string;
  readonly right: { readonly icon: string; readonly label: string; readonly onPress: () => void };
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
      style={{
        position: 'absolute',
        top: Math.max(insets.top - 1, 20),
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
