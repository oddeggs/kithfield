import { pill, sizes } from '@kithfield/theme';
import { View } from 'react-native';

import { ArtIcon } from '../art/art-view';
import { Press } from '../motion/press';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';

export type ChipKind = 'default' | 'selected' | 'suggestion' | 'invited' | 'ink';

/**
 * Chips (`01 Foundations`): default, selected, a suggestion, and the smaller "invited" state with
 * its check. `ink` is the small solid control at the end of a member row (32 tall).
 */
export function Chip({
  label,
  kind = 'default',
  onPress,
  accessibilityLabel,
}: {
  readonly label: string;
  readonly kind?: ChipKind;
  readonly onPress?: () => void;
  /** What VoiceOver reads when the chip's own word isn't enough ("Invite Fig", not "Invite"). */
  readonly accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const c = palette.chip;
  // The library draws each chip's 1-point border outside its height (34, or 30 and 32).
  const height = (kind === 'invited' ? 30 : kind === 'ink' ? 32 : sizes.chip) + 2;
  const look: Record<ChipKind, { bg: string; fg: string; border: string }> = {
    default: { bg: c.bg, fg: c.fg, border: c.border },
    selected: { bg: c.selectedBg, fg: c.selectedFg, border: c.selectedBg },
    suggestion: { bg: c.suggestionBg, fg: c.suggestionFg, border: c.border },
    invited: { bg: c.invitedBg, fg: c.suggestionFg, border: c.border },
    ink: { bg: c.selectedBg, fg: c.selectedFg, border: c.selectedBg },
  };
  const { bg, fg, border } = look[kind];
  const surface = {
    minHeight: height,
    paddingHorizontal: 13,
    borderRadius: pill(height),
    backgroundColor: bg,
    borderWidth: 1,
    borderColor: border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  } as const;
  const content = (
    <>
      {kind === 'invited' ? <ArtIcon name="check" size={13} color={fg} /> : null}
      <Txt variant="chip" medium color={fg} numberOfLines={1}>
        {label}
      </Txt>
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? label} style={surface}>
        {content}
      </View>
    );
  }
  return (
    <Press
      onPress={onPress}
      haptic="select"
      radius={pill(height)}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: kind === 'selected' }}
      hitSlop={(44 - height) / 2}
      style={surface}
    >
      {content}
    </Press>
  );
}
