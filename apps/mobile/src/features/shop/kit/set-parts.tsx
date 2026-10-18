import type { Season, ShopItem, ShopSet, Species } from '@kithfield/contracts';
import { View } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { itemName, setName, setPose } from '../copy';
import { ItemArt } from '../item-art';
import { useInks } from './inks';
import { SText } from './text';

/** Whose sticker each set's reward is, as the design draws it; the pose comes from the server. */
const REWARD_KIND: Readonly<Record<string, Species>> = {
  riverbank: 'duck',
  lighthouse_keeper: 'owl',
  orchard: 'bear',
  winter_hollow: 'mouse',
  teatime: 'rabbit',
};

/** The critter a set's art shows beside its cottage, and whose sticker its reward is. */
export const setCritter = (set: string): Species => REWARD_KIND[set] ?? 'rabbit';

/** A set's reward sticker. */
export function RewardSticker({ set, size }: { readonly set: ShopSet; readonly size: number }) {
  return (
    <ArtStill
      scene="sticker"
      width={size}
      height={size}
      attrs={{ kind: REWARD_KIND[set.set] ?? 'rabbit', pose: set.reward.sticker }}
      t={1.2}
    />
  );
}

/** A set's card: its name, how many pieces, the four pieces, and the reward strip. */
export function SetCard({
  set,
  items,
  width,
  season,
  onPress,
}: {
  readonly set: ShopSet;
  readonly items: (id: string) => ShopItem | null;
  readonly width: number;
  readonly season: Season;
  readonly onPress: () => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const name = t('shop.set.card', { set: setName(t, set.set) });
  const thumbs = set.items.length;
  const thumbW = (width - 28 - 6 * (thumbs - 1)) / thumbs;
  return (
    <Press
      onPress={onPress}
      radius={24}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={{ width, borderRadius: 24, backgroundColor: inks.tile, padding: 14, gap: 10 }}
    >
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <SText f="serif" s={21} style={{ flexShrink: 1 }}>
          {name}
        </SText>
        <SText s={13} color={palette.secondary}>
          {t('shop.set.pieces', { count: thumbs })}
        </SText>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {set.items.map((id) => {
          const item = items(id);
          return (
            <View
              key={id}
              style={{
                width: thumbW,
                height: 86,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: inks.setThumb,
              }}
              accessible
              accessibilityLabel={itemName(t, id)}
            >
              {item ? (
                <ItemArt
                  look={{ item: id, kind: item.kind, season, night: id === 'lighthouse' }}
                  width={thumbW}
                  height={86}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 16,
          backgroundColor: inks.reward.bg,
        }}
      >
        <RewardSticker set={set} size={56} />
        <SText s={13.5} lh={1.35} multiline color={inks.reward.fg} style={{ flex: 1 }}>
          <SText s={13.5} lh={1.35} w={600} color={palette.text}>
            {t('shop.set.rewardLead')}
          </SText>
          {t('shop.set.rewardRest', { pose: setPose(t, set.set) })}
        </SText>
      </View>
    </Press>
  );
}
