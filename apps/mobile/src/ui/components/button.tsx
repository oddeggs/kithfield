import { layout, pill, sizes } from '@kithfield/theme';
import { View } from 'react-native';

import { ArtIcon } from '../art/art-view';
import type { Haptic } from '../motion/haptics';
import { Press } from '../motion/press';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import type { ViewStyleProp } from '../style';

export type ButtonKind = 'primary' | 'go' | 'light' | 'destructive' | 'secondary' | 'text';
export type ButtonSize = 'large' | 'medium' | 'small';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** One primary per screen (`01 Foundations`). */
  readonly kind?: ButtonKind;
  /** 56, 48 or 36 tall; a text button is always medium. */
  readonly size?: ButtonSize;
  /** An icon from the design's set, before the label. */
  readonly icon?: string;
  readonly haptic?: Haptic;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly style?: ViewStyleProp;
}

const heights: Record<ButtonSize, number> = {
  large: sizes.buttonLarge,
  medium: sizes.buttonMedium,
  small: sizes.buttonSmall,
};

/** The pill buttons of `01 Foundations`: heights 56 / 48 / 36, always rounded to half their height. */
export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'large',
  icon,
  haptic,
  disabled = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { palette } = useTheme();
  const s: ButtonSize = kind === 'text' ? 'medium' : size;
  const height = heights[s];
  const colours =
    kind === 'text'
      ? { bg: 'transparent', fg: palette.text }
      : kind === 'secondary'
        ? { bg: palette.fillSecondary, fg: palette.text }
        : palette[kind];
  const variant = s === 'small' ? 'buttonSmall' : kind === 'text' ? 'buttonText' : 'button';
  return (
    <Press
      onPress={onPress}
      {...(haptic ? { haptic } : {})}
      disabled={disabled}
      radius={pill(height)}
      darken={kind !== 'text'}
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      style={[
        {
          minHeight: height,
          minWidth: layout.minHitTarget,
          borderRadius: pill(height),
          backgroundColor: colours.bg,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon ? <ArtIcon name={icon} size={22} color={colours.fg} /> : null}
        <Txt variant={variant} color={colours.fg} align="center">
          {label}
        </Txt>
      </View>
    </Press>
  );
}

export type CircleKind = 'soft' | 'ink' | 'glass';

/** The 44-point round buttons: soft ink tint, solid ink, or glass over art. */
export function CircleButton({
  icon,
  label,
  onPress,
  kind = 'soft',
  iconSize = 20,
  haptic,
}: {
  readonly icon: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly kind?: CircleKind;
  readonly iconSize?: number;
  readonly haptic?: Haptic;
}) {
  const { palette } = useTheme();
  const size = sizes.circle;
  const surface =
    kind === 'ink'
      ? { backgroundColor: palette.primary.bg }
      : kind === 'glass'
        ? {
            backgroundColor: palette.glassButton.fill,
            borderWidth: 1,
            borderColor: palette.glassButton.border,
          }
        : { backgroundColor: palette.fillSoft };
  const iconColour = kind === 'ink' ? palette.primary.fg : palette.text;
  return (
    <Press
      onPress={onPress}
      {...(haptic ? { haptic } : {})}
      radius={size / 2}
      accessibilityLabel={label}
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        { alignItems: 'center', justifyContent: 'center' },
        surface,
      ]}
    >
      <ArtIcon name={icon} size={iconSize} color={iconColour} />
    </Press>
  );
}
