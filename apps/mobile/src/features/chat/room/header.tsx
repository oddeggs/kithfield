import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../../ui/art/art-view';
import { Glass } from '../../../ui/components/glass';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useChatColours } from '../ui/chat-colours';

/** How a chat's header sizes: the farm 236 points tall shrinking to 150, the porch 300 to 170. */
export interface HeaderSize {
  readonly full: number;
  readonly min: number;
}

export const FARM_HEADER: HeaderSize = { full: 236, min: 150 };
export const PORCH_HEADER: HeaderSize = { full: 300, min: 170 };
/** The chat's sheet overlaps the art by this much, its rounded corners over the farm. */
export const SHEET_OVERLAP = 16;

/** The header's height for a scroll offset: it tracks the finger 1:1, then holds at its least. */
export function useHeaderHeight(scrollY: SharedValue<number>, size: HeaderSize) {
  return useDerivedValue(() =>
    Math.min(size.full, Math.max(size.min, size.full - Math.max(0, scrollY.get()))),
  );
}

/**
 * The art at the top of a chat. It shrinks as the chat scrolls, keeping its bottom (where the
 * critters stand) in view; the art moves, it is never redrawn.
 */
export function HeaderArtFrame({
  height,
  size,
  children,
}: {
  readonly height: SharedValue<number>;
  readonly size: HeaderSize;
  readonly children: ReactNode;
}) {
  const frame = useAnimatedStyle(() => ({ height: height.get() }));
  const art = useAnimatedStyle(() => ({ transform: [{ translateY: height.get() - size.full }] }));
  return (
    <Animated.View
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' }, frame]}
    >
      <Animated.View style={art}>{children}</Animated.View>
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

/** The back chevron, drawn as the design writes it. */
export function BackGlyph() {
  const { palette } = useTheme();
  return (
    <Txt
      variant="body"
      color={palette.text}
      style={{ fontSize: 26, lineHeight: 26, marginTop: -3 }}
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
  readonly onBack: () => void;
  readonly backLabel: string;
  readonly onTitle?: () => void;
  readonly titleLabel?: string;
  readonly right: { readonly icon: string; readonly label: string; readonly onPress: () => void };
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const colours = useChatColours();
  const pill = (
    <View style={{ paddingTop: 7, paddingBottom: 8, paddingHorizontal: 16, alignItems: 'center' }}>
      <Txt variant="displayS" numberOfLines={1} style={{ lineHeight: 19.55 }}>
        {title}
      </Txt>
      <Txt
        variant="caption"
        color={palette.body}
        numberOfLines={1}
        style={{ fontSize: 12, lineHeight: 15, marginTop: 2 }}
      >
        {subtitle}
      </Txt>
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
      <GlassCircle label={backLabel} onPress={onBack}>
        <BackGlyph />
      </GlassCircle>
      <Glass
        radius={22}
        fill={colours.glassFill}
        border={colours.glassBorder}
        style={{ flexShrink: 1, minWidth: 0 }}
      >
        {onTitle ? (
          <Press onPress={onTitle} radius={22} accessibilityLabel={titleLabel ?? title}>
            {pill}
          </Press>
        ) : (
          <View accessible accessibilityRole="header" accessibilityLabel={`${title}, ${subtitle}`}>
            {pill}
          </View>
        )}
      </Glass>
      <GlassCircle label={right.label} onPress={right.onPress}>
        <ArtIcon name={right.icon} size={right.icon === 'seeds' ? 24 : 22} color={palette.text} />
      </GlassCircle>
    </View>
  );
}
