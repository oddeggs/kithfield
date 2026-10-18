import { router } from 'expo-router';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { itemName } from '../copy';
import { useShop } from '../data/shop-data';
import { useMyWallName } from '../data/wall-name';
import { lowerFirst } from '../format';
import { Eyebrow, Title } from '../kit/bits';
import { useInks } from '../kit/inks';
import { Header, HeroSheet, useDesignTop } from '../kit/layout';
import { BigPill, CapsLabel, patronHero } from '../kit/patron-bits';
import { currentSeason } from '../kit/season';
import { SText } from '../kit/text';

/**
 * When patronage lapses: everything kept stays, the patron perks rest, and the way back. Thanks,
 * never a guilt trip.
 */
export function LapsedScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const shop = useShop();
  const wall = useMyWallName();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const hero = patronHero(shop.me?.critter);

  const kept = useMemo(() => {
    const items = shop.collection?.items ?? [];
    const kinds = new Map((shop.catalog?.items ?? []).map((i) => [i.item, i.kind]));
    const packs = items.filter((i) => kinds.get(i.item) === 'sticker_pack').length;
    const named = items
      .filter((i) => kinds.get(i.item) !== 'sticker_pack')
      .sort((a, b) => b.at - a.at)
      .slice(0, 3)
      .map((i, n) => (n === 0 ? itemName(t, i.item) : lowerFirst(itemName(t, i.item))));
    const parts = [
      ...named,
      ...(packs > 0 ? [t('shop.lapsed.packs', { count: packs })] : []),
      ...(wall.name !== null ? [t('shop.lapsed.wallName')] : []),
    ];
    return parts.length > 0 ? parts.join(', ') : t('shop.lapsed.nothing');
  }, [shop.collection, shop.catalog, t, wall.name]);

  return (
    <HeroSheet
      artHeight={320}
      sheetTop={290}
      art={
        <ArtStill
          scene="style"
          width={width}
          height={top(320)}
          t={1.2}
          attrs={{
            name: hero.cottage,
            season: currentSeason(),
            ...(hero.species ? { kind: hero.species } : {}),
          }}
        />
      }
      header={<Header />}
    >
      <Eyebrow text={t('shop.lapsed.eyebrow')} tone="quiet" />
      <Title text={t('shop.lapsed.title')} />
      <SText s={14.5} lh={1.45} multiline color={palette.body}>
        {t('shop.lapsed.body')}
      </SText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Card label={t('shop.lapsed.kept')} text={kept} tone="kept" />
        <Card label={t('shop.lapsed.resting')} text={t('shop.lapsed.restingList')} tone="resting" />
      </View>
      <BigPill label={t('shop.lapsed.again')} onPress={() => router.push('/shop/tiers')} />
    </HeroSheet>
  );
}

/** One of the two cards side by side: a tracked label and a list. */
function Card({
  label,
  text,
  tone,
}: {
  readonly label: string;
  readonly text: string;
  readonly tone: 'kept' | 'resting';
}) {
  const inks = useInks();
  const c = inks[tone];
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${text}`}
      style={{ flex: 1, borderRadius: 18, backgroundColor: c.bg, padding: 12, gap: 4 }}
    >
      <CapsLabel text={label} color={c.label} />
      <SText s={13.5} lh={1.4} multiline color={c.fg}>
        {text}
      </SText>
    </View>
  );
}
