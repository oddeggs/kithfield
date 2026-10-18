import type { StoreProductId } from '@kithfield/contracts';
import { View } from 'react-native';

import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Pill } from '../kit/bits';
import { SText } from '../kit/text';

/**
 * How much to put in: one pill per chip-in tier with the store's own price. Nobody but the
 * person ever sees which they chose.
 */
export function TierPicker({
  tiers,
  prices,
  busy,
  onPick,
  tone = 'go',
}: {
  readonly tiers: readonly StoreProductId[];
  readonly prices: Readonly<Record<string, string>>;
  readonly busy: boolean;
  readonly onPick: (tier: StoreProductId) => void;
  readonly tone?: 'go' | 'plum';
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View style={{ gap: 10 }} accessibilityRole="radiogroup">
      <SText s={15} lh={1.2} w={600}>
        {t('shop.chip.howMuch')}
      </SText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {/* Tiers are told apart only by the store's prices: without them, one pill (the first). */}
        {(tiers.some((tier) => prices[tier] !== undefined)
          ? tiers.filter((tier) => prices[tier] !== undefined)
          : tiers.slice(0, 1)
        ).map((tier) => {
          const price = prices[tier];
          return (
            <Pill
              key={tier}
              label={price ? t('shop.chip.tier', { price }) : t('shop.chip.button')}
              kind={tone}
              busy={busy}
              onPress={() => onPick(tier)}
              style={{ flexGrow: 1, flexBasis: '45%' }}
            />
          );
        })}
      </View>
      <SText s={12.5} lh={1.45} color={palette.secondary} multiline>
        {t('shop.chip.nobodySees')}
      </SText>
    </View>
  );
}
