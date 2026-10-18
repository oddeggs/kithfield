import type { Critter } from '@kithfield/contracts';
import { layout, rhythmColours, sizes } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { lookOf } from '../../ui/art/critter-look';
import { Glass } from '../../ui/components/glass';
import { useLocale } from '../../ui/locale/locale-provider';
import type { Haptic } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import type { ViewStyleProp } from '../../ui/style';
import { typeAt } from '../farm/type-at';

/* The chrome the rhythm screens share: the top bar over the art, the title pill and buttons. */

const CIRCLE = sizes.circle;

/** The round glass back button. */
export function BackButton({ onPress }: { readonly onPress: () => void }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <Press
      onPress={onPress}
      radius={CIRCLE / 2}
      accessibilityRole="button"
      accessibilityLabel={t('rhythm.back')}
    >
      <Glass
        radius={CIRCLE / 2}
        fill={palette.glassButton.fill}
        border={palette.glassButton.border}
        style={{ width: CIRCLE, height: CIRCLE, alignItems: 'center', justifyContent: 'center' }}
      >
        <Txt variant="chevron" color={palette.text} style={{ fontSize: 26, marginTop: -3 }}>
          ‹
        </Txt>
      </Glass>
    </Press>
  );
}

/**
 * The bar across the top of a screen: back on the left, a pill or anything else in the middle,
 * and a matching space (or `right`) on the right.
 */
export function TopBar({
  top,
  inset = 14,
  onBack,
  center,
  right,
}: {
  readonly top: number;
  readonly inset?: number;
  readonly onBack?: () => void;
  readonly center?: ReactNode;
  readonly right?: ReactNode;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top,
        left: inset,
        right: inset,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 6,
      }}
    >
      {onBack ? <BackButton onPress={onBack} /> : <View style={{ width: CIRCLE }} />}
      {center ?? null}
      {right ?? <View style={{ width: CIRCLE }} />}
    </View>
  );
}

/** A glass pill over the art: a title, maybe a line under it, maybe an icon before it. */
export function TitlePill({
  title,
  subtitle,
  icon,
  serif = false,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: string;
  readonly serif?: boolean;
}) {
  const { palette, appearance } = useTheme();
  const { fontLocale } = useLocale();
  return (
    <Glass
      radius={22}
      // By night the pill takes the night glass, as the farm header does.
      fill={rhythmColours[appearance].pill ?? palette.glassButton.fill}
      border={palette.glassButton.border}
      style={{
        paddingHorizontal: icon ? 14 : 16,
        paddingTop: icon ? 9 : 7,
        paddingBottom: icon ? 9 : 8,
        alignItems: 'center',
        flexShrink: 1,
      }}
    >
      <View
        accessible
        accessibilityRole="header"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        {icon ? <ArtIcon name={icon} size={20} color={palette.text} /> : null}
        {serif ? (
          <Txt
            variant="displayS"
            color={palette.text}
            numberOfLines={1}
            style={typeAt('displayS', 16, 18.4, fontLocale)}
          >
            {title}
          </Txt>
        ) : (
          <Txt variant="buttonSmall" color={palette.text} numberOfLines={1}>
            {title}
          </Txt>
        )}
      </View>
      {subtitle ? (
        <Txt variant="note" color={palette.body} style={{ fontSize: 12, lineHeight: 14.4 }}>
          {subtitle}
        </Txt>
      ) : null}
    </Glass>
  );
}

/**
 * A full-width or paired action at the foot of a screen, in the colours the design gives it (the
 * rose, a fruit, ink or the soft fill).
 */
export function ActionButton({
  label,
  onPress,
  bg,
  fg,
  icon,
  small = false,
  haptic,
  disabled = false,
  hint,
  style,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly bg: string;
  readonly fg: string;
  readonly icon?: string;
  /** The quieter of a pair: 15-point type. */
  readonly small?: boolean;
  readonly haptic?: Haptic;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly style?: ViewStyleProp;
}) {
  const height = sizes.buttonLarge;
  return (
    <Press
      onPress={onPress}
      radius={height / 2}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(haptic ? { haptic } : {})}
      {...(hint ? { accessibilityHint: hint } : {})}
      style={[
        {
          height,
          minWidth: layout.minHitTarget,
          borderRadius: height / 2,
          backgroundColor: bg,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: small ? 6 : 8 }}>
        {icon ? <ArtIcon name={icon} size={20} color={fg} /> : null}
        <Txt variant={small ? 'buttonText' : 'button'} color={fg} numberOfLines={1}>
          {label}
        </Txt>
      </View>
    </Press>
  );
}

/** A soft chip with an icon, as at a friend's gate. */
export function IconChip({
  label,
  icon,
  bg,
  fg,
  onPress,
  disabled = false,
  height = 34,
}: {
  readonly label: string;
  readonly icon: string;
  readonly bg: string;
  readonly fg: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly height?: number;
}) {
  return (
    <Press
      onPress={onPress}
      radius={height / 2}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 5, bottom: 5 }}
      style={{
        height,
        paddingHorizontal: 13,
        borderRadius: height / 2,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <ArtIcon name={icon} size={18} color={fg} />
      <Txt variant="buttonSmall" color={fg}>
        {label}
      </Txt>
    </Press>
  );
}

/** Critters side by side, each ringed in the surface colour, overlapping a little. */
export function Faces({
  critters,
  size,
  ring,
  overlap = 8,
}: {
  readonly critters: readonly Critter[];
  readonly size: number;
  readonly ring: string;
  readonly overlap?: number;
}) {
  return (
    <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
      {critters.map((c, i) => (
        <Avatar
          key={i}
          kind={c.species}
          look={lookOf(c)}
          size={size}
          ring={ring}
          style={i > 0 ? { marginLeft: -overlap } : null}
        />
      ))}
    </View>
  );
}
