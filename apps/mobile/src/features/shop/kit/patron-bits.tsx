import { shopMotion } from '@kithfield/theme';
import type { Critter, Species } from '@kithfield/contracts';
import { Canvas, Oval, RadialGradient, vec } from '@shopify/react-native-skia';
import { Children, isValidElement, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ArtIcon } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import type { ViewStyleProp } from '../../../ui/style';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useRestore } from '../data/flows';
import { openShopPage } from '../site';
import { useInks } from './inks';
import { SText } from './text';

/* The pieces the patron screens share: ticks, perks, the legal links, rows and the glow. */

/** The cottage styles a patron's hero can show. */
const COTTAGES: ReadonlySet<string> = new Set([
  'windmill',
  'treehouse',
  'houseboat',
  'lighthouse',
  'mushroom',
  'carriage',
  'skep',
  'teapot',
  'igloo',
]);

/** The patron's own cottage style (the houseboat when they wear none) and their species. */
export function patronHero(critter: Critter | null | undefined): {
  readonly cottage: string;
  readonly species: Species | null;
} {
  const own = critter?.cottage;
  return {
    cottage: own !== null && own !== undefined && COTTAGES.has(own) ? own : 'houseboat',
    species: critter?.species ?? null,
  };
}

/** A moss tick and a line (14.5/1.45), as the patron screens list what's true. */
export function Tick({ text }: { readonly text: string }) {
  const inks = useInks();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <ArtIcon name="check" size={20} color={inks.fillMoss} style={{ marginTop: 1 }} />
      <SText s={14.5} lh={1.45} multiline color={inks.paragraph} style={{ flex: 1 }}>
        {text}
      </SText>
    </View>
  );
}

/** The patron's perks in two columns, each with a honey sparkle (13.5/1.35). */
export function PerkGrid({ perks }: { readonly perks: readonly string[] }) {
  const inks = useInks();
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 12 }}>
      {perks.map((perk) => (
        <View
          key={perk}
          style={{ width: '47%', flexGrow: 1, flexDirection: 'row', gap: 6, alignItems: 'center' }}
        >
          <ArtIcon name="sparkle" size={14} color={inks.sparkle} />
          <SText s={13.5} lh={1.35} multiline color={palette.text} style={{ flex: 1 }}>
            {perk}
          </SText>
        </View>
      ))}
    </View>
  );
}

/** Terms of Use, the Privacy Policy and Restore purchases, as App Review asks for them. */
export function LegalLinks() {
  const { t, language } = useLocale();
  const inks = useInks();
  const restore = useRestore();
  const link = (label: string, onPress: () => void) => (
    <Press
      onPress={onPress}
      darken={false}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={10}
    >
      <SText
        s={13}
        lh={1.3}
        w={600}
        color={inks.paragraph}
        style={{ textDecorationLine: 'underline' }}
      >
        {label}
      </SText>
    </Press>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        rowGap: 4,
        columnGap: 14,
      }}
    >
      {link(t('shop.legal.terms'), () => openShopPage('terms', language))}
      {link(t('shop.legal.privacy'), () => openShopPage('privacy', language))}
      {link(t('shop.legal.restore'), () => void restore())}
    </View>
  );
}

/**
 * The patron screens' honey (or other) pill: 54 tall, 600 16, with an optional second line
 * (500 12) naming the period a subscription renews by.
 */
export function BigPill({
  label,
  sub,
  onPress,
  tone = 'honey',
  busy = false,
}: {
  readonly label: string;
  readonly sub?: string;
  readonly onPress: () => void;
  readonly tone?: 'honey' | 'danger';
  readonly busy?: boolean;
}) {
  const inks = useInks();
  const c = tone === 'honey' ? inks.honeyButton : inks.danger;
  return (
    <Press
      onPress={onPress}
      disabled={busy}
      haptic="tap"
      radius={27}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      accessibilityState={{ busy }}
      style={{
        height: 54,
        borderRadius: 27,
        backgroundColor: c.bg,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        opacity: busy ? 0.7 : 1,
      }}
    >
      <SText s={16} w={600} color={c.fg} numberOfLines={1} align="center">
        {label}
      </SText>
      {sub ? (
        <SText s={12} w={500} color={c.fg} numberOfLines={1} align="center">
          {sub}
        </SText>
      ) : null}
    </Press>
  );
}

/** A row on the patron's own view: a honey icon tile, a title and a line under it. */
export function PerkRow({
  icon,
  title,
  sub,
  onPress,
  last = false,
}: {
  readonly icon: string;
  readonly title: string;
  readonly sub: string;
  readonly onPress?: () => void;
  readonly last?: boolean;
}) {
  const inks = useInks();
  const { palette } = useTheme();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: palette.hairline,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: inks.perkTile,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArtIcon name={icon} size={20} color={palette.text} />
      </View>
      <View style={{ flex: 1 }}>
        <SText s={15} lh={1.2} w={600} multiline>
          {title}
        </SText>
        <SText s={13} lh={1.3} multiline color={inks.body}>
          {sub}
        </SText>
      </View>
    </View>
  );
  return onPress ? (
    <Press
      onPress={onPress}
      darken={false}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${sub}`}
    >
      {body}
    </Press>
  ) : (
    <View accessible accessibilityLabel={`${title}, ${sub}`}>
      {body}
    </View>
  );
}

/** Rows on one card (radius 22, 2 × 14 padding), hairlines between them. */
export function GroupCard({ children }: { readonly children: ReactNode }) {
  const inks = useInks();
  const { palette } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={{
        borderRadius: 22,
        backgroundColor: inks.tile,
        paddingVertical: 2,
        paddingHorizontal: 14,
      }}
    >
      {rows.map((row, i) => (
        <View
          key={row.key ?? i}
          style={
            i < rows.length - 1
              ? { borderBottomWidth: 1, borderBottomColor: palette.hairline }
              : null
          }
        >
          {row}
        </View>
      ))}
    </View>
  );
}

/** A row of a group card: a 600 label and a value, or a chevron when it goes somewhere. */
export function GroupRow({
  label,
  value,
  onPress,
}: {
  readonly label: string;
  readonly value?: string;
  readonly onPress?: () => void;
}) {
  const inks = useInks();
  const body = (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 13,
      }}
    >
      <SText s={15.5} w={600} numberOfLines={1}>
        {label}
      </SText>
      <SText s={15.5} color={inks.body} numberOfLines={1} style={{ flexShrink: 1 }}>
        {value ?? '›'}
      </SText>
    </View>
  );
  return onPress ? (
    <Press onPress={onPress} darken={false} accessibilityRole="button" accessibilityLabel={label}>
      {body}
    </Press>
  ) : (
    <View accessible accessibilityLabel={value ? `${label}, ${value}` : label}>
      {body}
    </View>
  );
}

/** A section label over a list: 700 12, tracked, upper case. */
export function CapsLabel({ text, color }: { readonly text: string; readonly color?: string }) {
  const inks = useInks();
  return (
    <SText s={12} w={700} caps color={color ?? inks.label} accessibilityRole="header">
      {text}
    </SText>
  );
}

/**
 * The lantern's honey glow over the patron's cottage, breathing over 3 s on the UI thread; still
 * under Reduce Motion.
 */
export function LanternGlow({
  width,
  height,
  style,
}: {
  readonly width: number;
  readonly height: number;
  readonly style?: ViewStyleProp;
}) {
  const inks = useInks();
  const reduce = useReduceMotion();
  const breath = useSharedValue(1);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(breath);
      breath.set(1);
      return;
    }
    breath.set(
      withRepeat(
        withTiming(0.55, {
          duration: shopMotion.lanternBreathMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(breath);
  }, [breath, reduce]);
  const fade = useAnimatedStyle(() => ({ opacity: breath.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width, height }, style, fade]}
    >
      <Canvas style={{ width, height }}>
        <Oval x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={vec(width / 2, height / 2)}
            r={(Math.max(width, height) / 2) * 0.7}
            colors={[inks.lanternGlow, inks.lanternGlowEdge]}
          />
        </Oval>
      </Canvas>
    </Animated.View>
  );
}
