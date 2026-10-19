import { farm } from '@kithfield/theme';
import { View } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { Glass } from '../../ui/components/glass';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { typeAt } from './type-at';

const PILL = 44;

/**
 * The glass pills over the farm: its name (tap for the valley of farms) and the season in hand
 * lettering.
 */
export function FarmHeader({
  name,
  season,
  top,
  onSwitch,
}: {
  readonly name: string;
  /** The season pill; none while the farm is still loading. */
  readonly season: string;
  readonly top: number;
  readonly onSwitch: () => void;
}) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  const glass = palette.glassButton;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Press
        onPress={onSwitch}
        haptic="select"
        radius={PILL / 2}
        accessibilityLabel={t('farm.switch', { name })}
        accessibilityHint={t('farm.switch.hint')}
        style={{ flexShrink: 1 }}
      >
        <Glass
          radius={PILL / 2}
          fill={glass.fill}
          border={glass.border}
          shadow={farm.shadows.glassPill}
          style={{
            height: PILL,
            paddingLeft: 6,
            paddingRight: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: palette.primary.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArtIcon name="farm" size={20} color={palette.primary.fg} />
          </View>
          <Txt variant="displayS" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Txt>
          <Txt variant="bubbleName" color={palette.secondary} importantForAccessibility="no">
            ▾
          </Txt>
        </Glass>
      </Press>
      {season ? (
        <Glass
          radius={PILL / 2}
          fill={glass.fill}
          border={glass.border}
          style={{ height: PILL, paddingHorizontal: 14, justifyContent: 'center' }}
        >
          <Txt variant="handS" style={typeAt('handS', 17, 17, fontLocale)}>
            {season}
          </Txt>
        </Glass>
      ) : null}
    </View>
  );
}
