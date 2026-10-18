import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ArtIcon } from '../../../ui/art/art-view';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useKitColors } from './colors';
import { KText } from './text';

/**
 * Settings' row: a 30-point tile, a regular title with a line under it, then a
 * value with its chevron, or a control. At least 50 tall.
 */
export function SettingRow({
  title,
  subtitle,
  icon,
  indent = false,
  value,
  trailing,
  onPress,
  danger = false,
  roomy = false,
}: {
  readonly title: string;
  readonly subtitle?: string;
  /** An icon on the tile; `indent` keeps the tile's room empty instead. */
  readonly icon?: string;
  readonly indent?: boolean;
  /** A value at the end; a tappable row adds the chevron. */
  readonly value?: string;
  readonly trailing?: ReactNode;
  readonly onPress?: () => void;
  readonly danger?: boolean;
  /** A row with a long line under its title and a control (AI catch-up): 10 above and below. */
  readonly roomy?: boolean;
}) {
  const { palette } = useTheme();
  const kit = useKitColors();
  const end =
    trailing ??
    (value !== undefined || onPress ? (
      <KText kind="value" color={kit.settingsLabel} numberOfLines={1} style={{ flexShrink: 0 }}>
        {[value, onPress ? '›' : null].filter((s) => s).join(' ')}
      </KText>
    ) : null);
  const body = (
    <>
      {icon ? (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            backgroundColor: kit.settingsTile,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArtIcon name={icon} size={18} color={danger ? kit.danger : kit.body2} />
        </View>
      ) : indent ? (
        <View style={{ width: 30 }} />
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <KText kind="settingTitle" multiline color={danger ? kit.danger : palette.text}>
          {title}
        </KText>
        {subtitle ? (
          <KText kind="settingSub" multiline color={palette.secondary} style={{ marginTop: 2 }}>
            {subtitle}
          </KText>
        ) : null}
      </View>
      {end}
    </>
  );
  const style = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 50,
    paddingVertical: roomy ? 10 : 8,
    paddingHorizontal: 14,
  } as const;
  const label = [title, subtitle, value].filter((s) => s).join(', ');
  if (!onPress || trailing) {
    return (
      <View accessible={!trailing} accessibilityLabel={label} style={style}>
        {body}
      </View>
    );
  }
  return (
    <Press
      onPress={onPress}
      darken
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}
    >
      {body}
    </Press>
  );
}
