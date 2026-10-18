import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { Glass } from '../../ui/components/glass';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import type { ViewStyleProp } from '../../ui/style';
import { Txt } from '../../ui/type/text';
import { fireLook, fireSize } from './look';

/*
 * The fire room's chrome over the night scene: the round glass buttons and title pill, the panel
 * at the bottom, its buttons, and the name chips over the critters.
 */

/** The design's top inset for the header (58 on a 852-point phone), from the safe area. */
export function useHeaderTop(): number {
  const { top } = useSafeAreaInsets();
  return Math.max(top, 47) + 11;
}

/** A round glass button over the scene. */
export function GlassRound({
  label,
  onPress,
  children,
  fill = fireLook.glass,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
  readonly fill?: string;
  readonly testID?: string;
}) {
  const s = fireSize.button;
  return (
    <Press
      onPress={onPress}
      haptic="select"
      radius={s / 2}
      darken={false}
      accessibilityLabel={label}
      accessibilityRole="button"
      {...(testID ? { testID } : {})}
    >
      <Glass
        radius={s / 2}
        fill={fill}
        border={fireLook.glassBorder}
        style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </Glass>
    </Press>
  );
}

/** "‹" back to the farm, the title pill, and a button on the right (or room for one). */
export function FireHeader({
  title,
  line,
  right,
}: {
  readonly title: string;
  readonly line: string;
  readonly right?: ReactNode;
}) {
  const { t } = useLocale();
  const top = useHeaderTop();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top,
        left: fireSize.sideInset,
        right: fireSize.sideInset,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 12,
      }}
    >
      <GlassRound label={t('fire.back')} onPress={() => router.back()} testID="fire-back">
        <Txt
          variant="body"
          color={fireLook.text}
          importantForAccessibility="no"
          style={{ fontSize: 26, lineHeight: 30, marginTop: -3 }}
        >
          ‹
        </Txt>
      </GlassRound>
      <Glass
        radius={22}
        fill={fireLook.glass}
        border={fireLook.glassBorder}
        style={{
          paddingTop: 7,
          paddingBottom: 8,
          paddingHorizontal: 16,
          flexShrink: 1,
          marginHorizontal: 8,
        }}
      >
        <View accessible accessibilityRole="header" accessibilityLabel={`${title}, ${line}`}>
          <Txt
            variant="displayS"
            color={fireLook.text}
            align="center"
            style={{ fontSize: 17, lineHeight: 19.5 }}
          >
            {title}
          </Txt>
          <Txt
            variant="caption"
            color={fireLook.sub}
            align="center"
            numberOfLines={1}
            style={{ fontSize: 12, lineHeight: 15, marginTop: 2 }}
          >
            {line}
          </Txt>
        </View>
      </Glass>
      {right ?? <View style={{ width: fireSize.button }} />}
    </View>
  );
}

/** The glass panel at the bottom of the room. */
export function FirePanel({
  children,
  gap = 14,
  tight = false,
}: {
  readonly children: ReactNode;
  readonly gap?: number;
  /** The weak-connection panel sits a little tighter. */
  readonly tight?: boolean;
}) {
  const inset = fireSize.panelInset;
  return (
    <Glass
      radius={fireSize.panelRadius}
      fill={fireLook.panel}
      border={fireLook.panelBorder}
      style={{
        position: 'absolute',
        left: inset,
        right: inset,
        bottom: inset,
        paddingTop: tight ? 14 : 16,
        paddingHorizontal: tight ? 16 : 18,
        paddingBottom: tight ? 28 : 30,
        gap,
        zIndex: 20,
      }}
    >
      {children}
    </Glass>
  );
}

/** The panel's eyebrow, title and words, when it asks something (lighting, joining, leaving). */
export function AskText({
  eyebrow,
  title,
  body,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <>
      {eyebrow ? (
        <Txt variant="handL" color={fireLook.eyebrow} style={{ fontSize: 18, lineHeight: 19.8 }}>
          {eyebrow}
        </Txt>
      ) : null}
      <Txt
        variant="displayM"
        color={fireLook.title}
        accessibilityRole="header"
        multiline
        style={{ fontSize: 26, lineHeight: 29.1 }}
      >
        {title}
      </Txt>
      <Txt variant="body" color={fireLook.sub} multiline style={{ fontSize: 14.5, lineHeight: 21 }}>
        {body}
      </Txt>
    </>
  );
}

/** A full-width button in the panel: honey for the main thing, quiet glass for the other. */
export function FireButton({
  label,
  icon,
  onPress,
  kind = 'primary',
  height = fireSize.bigButton,
  flex,
  disabled = false,
  testID,
}: {
  readonly label: string;
  readonly icon?: string;
  readonly onPress: () => void;
  readonly kind?: 'primary' | 'secondary' | 'stop';
  readonly height?: number;
  readonly flex?: number;
  readonly disabled?: boolean;
  readonly testID?: string;
}) {
  const fill =
    kind === 'primary' ? fireLook.primary : kind === 'stop' ? fireLook.stop : fireLook.secondary;
  const ink = kind === 'primary' ? fireLook.primaryInk : fireLook.text;
  const style: ViewStyleProp = [
    {
      height,
      borderRadius: height / 2,
      backgroundColor: fill,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
      opacity: disabled ? 0.5 : 1,
    },
    flex === undefined ? null : { flex, minWidth: 0 },
  ];
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      haptic="tap"
      radius={height / 2}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={style}
      {...(testID ? { testID } : {})}
    >
      {icon ? <ArtIcon name={icon} size={22} color={ink} /> : null}
      <Txt variant="button" color={ink} numberOfLines={1} style={{ fontSize: 16, lineHeight: 19 }}>
        {label}
      </Txt>
    </Press>
  );
}

/** Four bars that rise and fall with someone's voice, on the UI thread. */
export function LevelBars({
  level,
  color,
}: {
  readonly level: SharedValue<number>;
  readonly color: string;
}) {
  const rest = [6, 11, 8, 12];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }}>
      {rest.map((h, i) => (
        <Bar key={i} rest={h} i={i} level={level} color={color} />
      ))}
    </View>
  );
}

function Bar({
  rest,
  i,
  level,
  color,
}: {
  readonly rest: number;
  readonly i: number;
  readonly level: SharedValue<number>;
  readonly color: string;
}) {
  const style = useAnimatedStyle(() => {
    const l = level.get();
    const k = l <= 0 ? 1 : 0.55 + Math.min(1, l * (1.4 + ((i * 37) % 5) * 0.12)) * 0.45;
    return { height: Math.max(3, rest * k) };
  });
  return <Animated.View style={[{ width: 2.5, borderRadius: 2, backgroundColor: color }, style]} />;
}

export type ChipKind = 'talking' | 'muted' | 'listening' | 'paused' | 'plain';

/** A name chip over a critter: honey while they talk; otherwise dark, with how they're there. */
export function NameChip({
  name,
  kind,
  note,
  level,
  label,
  x,
  y,
}: {
  readonly name: string;
  readonly kind: ChipKind;
  readonly note?: string;
  readonly level?: SharedValue<number>;
  readonly label: string;
  /** Its middle and top, in the scene's points. */
  readonly x: number;
  readonly y: number;
}) {
  const talking = kind === 'talking';
  const ink = talking ? fireLook.talkingInk : fireLook.text;
  const icon =
    kind === 'muted' ? 'muted' : kind === 'listening' ? 'ear' : kind === 'paused' ? 'moon' : null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - 120,
        top: y,
        width: 240,
        alignItems: 'center',
        zIndex: 6,
      }}
    >
      <View
        accessible
        accessibilityLabel={label}
        style={{
          height: fireSize.chipHeight,
          paddingHorizontal: 8,
          borderRadius: fireSize.chipHeight / 2,
          backgroundColor: talking ? fireLook.talking : fireLook.chip,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {talking && level ? <LevelBars level={level} color={ink} /> : null}
        {icon ? <ArtIcon name={icon} size={13} color={ink} /> : null}
        <Txt variant="buttonSmall" color={ink} style={{ fontSize: 12, lineHeight: 14 }}>
          {name}
        </Txt>
        {note ? (
          <Txt
            variant="handS"
            color={ink}
            style={{ fontSize: 12.5, lineHeight: 13, opacity: 0.85 }}
          >
            {note}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/** The little critters of the people by the fire, overlapping, in the panel. */
export function CritterStack({
  people,
  size = fireSize.stackAvatar,
}: {
  readonly people: readonly { readonly id: string; readonly kind: string; readonly look: object }[];
  readonly size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
      {people.slice(0, 4).map((p, i) => (
        <Avatar
          key={p.id}
          kind={p.kind}
          look={p.look}
          size={size}
          ring={fireLook.ring}
          style={i === 0 ? undefined : { marginLeft: -7 }}
        />
      ))}
    </View>
  );
}
