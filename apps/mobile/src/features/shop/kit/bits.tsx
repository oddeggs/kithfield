import { useEffect, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtIcon } from '../../../ui/art/art-view';
import type { Haptic } from '../../../ui/motion/haptics';
import { sheetTo } from '../../../ui/motion/motion';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import type { ViewStyleProp } from '../../../ui/style';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useInks } from './inks';
import { SText } from './text';

export type PillKind = 'go' | 'ink' | 'soft' | 'honey' | 'plum' | 'danger';

/**
 * The shop's pill buttons: 54 tall, 600 14.5 (the patron screens' are 15.5 with a subline). A
 * `busy` pill stays where it is and dims while the store answers.
 */
export function Pill({
  label,
  sub,
  onPress,
  kind = 'go',
  icon,
  disabled = false,
  busy = false,
  flex,
  size = 14.5,
  haptic = 'tap',
  style,
}: {
  readonly label: string;
  /** A second, smaller line (the period a subscription renews by). */
  readonly sub?: string;
  readonly onPress: () => void;
  readonly kind?: PillKind;
  readonly icon?: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly flex?: number;
  readonly size?: number;
  readonly haptic?: Haptic;
  readonly style?: ViewStyleProp;
}) {
  const inks = useInks();
  const colours =
    kind === 'go'
      ? inks.go
      : kind === 'ink'
        ? inks.ink
        : kind === 'soft'
          ? inks.soft
          : kind === 'honey'
            ? inks.honeyButton
            : kind === 'plum'
              ? { bg: inks.wish.button, fg: '#ffffff' }
              : inks.danger;
  const off = disabled || busy;
  return (
    <Press
      onPress={onPress}
      disabled={off}
      haptic={haptic}
      radius={27}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      accessibilityState={{ disabled: off, busy }}
      style={[
        {
          height: sub ? 64 : 54,
          borderRadius: sub ? 32 : 27,
          backgroundColor: colours.bg,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : busy ? 0.7 : 1,
          minWidth: 0,
        },
        flex === undefined ? null : { flex, flexBasis: 0 },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <ArtIcon name={icon} size={20} color={colours.fg} /> : null}
        <SText s={size} w={600} color={colours.fg} numberOfLines={1} align="center">
          {label}
        </SText>
      </View>
      {sub ? (
        <SText s={13} lh={1.2} color={colours.fg} numberOfLines={1} align="center">
          {sub}
        </SText>
      ) : null}
    </Press>
  );
}

/** A small rounded tag after a name: the price, "patrons", "yours". */
export function Tag({
  text,
  kind = 'price',
}: {
  readonly text: string;
  readonly kind?: 'price' | 'patrons' | 'owned';
}) {
  const inks = useInks();
  const c = kind === 'price' ? inks.price : kind === 'patrons' ? inks.patrons : inks.owned;
  return (
    <View
      style={{ paddingVertical: 5, paddingHorizontal: 8, borderRadius: 10, backgroundColor: c.bg }}
    >
      <SText s={12.5} w={600} color={c.fg} numberOfLines={1}>
        {text}
      </SText>
    </View>
  );
}

/** The hand-lettered line over a title. */
export function Eyebrow({
  text,
  tone = 'moss',
  size = 17,
}: {
  readonly text: string;
  readonly tone?: 'moss' | 'honey' | 'plum' | 'quiet';
  readonly size?: number;
}) {
  const inks = useInks();
  return (
    <SText f="hand" s={size} lh={1.1} color={inks.eyebrow[tone]}>
      {text}
    </SText>
  );
}

/** A Young Serif title. */
export function Title({
  text,
  size = 26,
  lh = 1.12,
}: {
  readonly text: string;
  readonly size?: number;
  readonly lh?: number;
}) {
  return (
    <SText f="serif" s={size} lh={lh} accessibilityRole="header">
      {text}
    </SText>
  );
}

export interface Tab<T extends string> {
  readonly id: T;
  readonly label: string;
}

/**
 * The row of chips under a title (32 tall, 600 13): the chosen one is ink, the rest card with a
 * quiet border. It scrolls sideways and fades out at its right edge, as drawn.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  inset = 0,
}: {
  readonly tabs: readonly Tab<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  /** The screen margin the row bleeds past when it scrolls. */
  readonly inset?: number;
}) {
  const { palette } = useTheme();
  const inks = useInks();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -inset, flexGrow: 0 }}
      contentContainerStyle={{ gap: 6, paddingHorizontal: inset }}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <Press
            key={tab.id}
            onPress={() => onChange(tab.id)}
            haptic="select"
            radius={16}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            style={{
              height: 32,
              paddingHorizontal: 12,
              borderRadius: 16,
              justifyContent: 'center',
              backgroundColor: on ? palette.chip.selectedBg : inks.tile,
              borderWidth: 1,
              borderColor: on ? palette.chip.selectedBg : inks.tileBorder,
            }}
          >
            <SText s={13} w={600} color={on ? palette.chip.selectedFg : palette.text}>
              {tab.label}
            </SText>
          </Press>
        );
      })}
    </ScrollView>
  );
}

/**
 * How full something is, 0 to 1: a 10-point rounded track whose fill grows continuously on the
 * sheet spring (`motion.sheet`); under Reduce Motion it is simply there.
 */
export function Progress({
  value,
  tone = 'moss',
  height = 10,
  label,
}: {
  readonly value: number;
  readonly tone?: 'moss' | 'plum' | 'quiet';
  readonly height?: number;
  readonly label?: string;
}) {
  const inks = useInks();
  const reduce = useReduceMotion();
  const fill = useSharedValue(reduce ? value : 0);
  useEffect(() => {
    fill.set(sheetTo(value, reduce));
  }, [fill, reduce, value]);
  const bar = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.get())) * 100}%` }));
  const colour = tone === 'moss' ? inks.fillMoss : tone === 'plum' ? inks.fillPlum : inks.fillQuiet;
  return (
    <View
      accessibilityRole="progressbar"
      {...(label ? { accessibilityLabel: label } : {})}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: inks.track, overflow: 'hidden' }}
    >
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: colour }, bar]} />
    </View>
  );
}

/** The moss note with a leaf (or another icon), as under the cart. */
export function InfoNote({
  text,
  icon = 'leaf',
  tone = 'moss',
  style,
}: {
  readonly text: string;
  readonly icon?: string;
  readonly tone?: 'moss' | 'honey' | 'plum';
  readonly style?: ViewStyleProp;
}) {
  const inks = useInks();
  const c =
    tone === 'moss'
      ? inks.info
      : tone === 'honey'
        ? { bg: inks.reward.bg, fg: inks.reward.fg, icon: inks.reward.fg }
        : { bg: inks.wish.bg, fg: inks.wish.fg, icon: inks.wish.fg };
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 16,
          backgroundColor: c.bg,
        },
        style,
      ]}
    >
      {icon === 'rosette' ? (
        <ArtIcon name={icon} size={22} color="none" />
      ) : (
        <ArtIcon name={icon} size={20} color={c.icon} />
      )}
      <SText s={13} lh={1.4} color={c.fg} multiline style={{ flex: 1 }}>
        {text}
      </SText>
    </View>
  );
}

/** A ring around the chosen swatch: the sheet's colour, then ink (`0 0 0 2.5px, 0 0 0 4.5px`). */
export function ringStyle(on: boolean, gap: string, ring: string, quiet: string) {
  return {
    boxShadow: on ? `0 0 0 2.5px ${gap}, 0 0 0 4.5px ${ring}` : `0 0 0 1px ${quiet}`,
  } as const;
}

/** A tick and a line, as the patron screens list what's true. */
export function CheckLine({
  text,
  size = 15.5,
  icon = 'check',
}: {
  readonly text: string;
  readonly size?: number;
  readonly icon?: string;
}) {
  const inks = useInks();
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <ArtIcon name={icon} size={22} color={icon === 'sparkle' ? '#c9973e' : inks.fillMoss} />
      <SText s={size} lh={1.4} multiline color={palette.text} style={{ flex: 1 }}>
        {text}
      </SText>
    </View>
  );
}

/** Underlined small links under a patron screen (Terms, Privacy, Restore). */
export function LinkText({
  text,
  onPress,
  size = 14,
  underline = true,
}: {
  readonly text: string;
  readonly onPress: () => void;
  readonly size?: number;
  readonly underline?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Press
      onPress={onPress}
      darken={false}
      accessibilityRole="link"
      accessibilityLabel={text}
      hitSlop={8}
    >
      <SText
        s={size}
        w={600}
        color={palette.text}
        style={underline ? { textDecorationLine: 'underline' } : null}
      >
        {text}
      </SText>
    </Press>
  );
}

/** A row of children with the design's gap, centred. */
export function Row({
  children,
  gap = 10,
  style,
}: {
  readonly children: ReactNode;
  readonly gap?: number;
  readonly style?: ViewStyleProp;
}) {
  return (
    <View style={[{ flexDirection: 'row', gap, alignItems: 'center' }, style]}>{children}</View>
  );
}
