import type { Collection, ShopItemKind } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useCottage } from '../../../data/react';
import { ArtStill } from '../../../ui/art/art-view';
import { EmptyState } from '../../../ui/components/state-shell';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { itemName, setName, setPose } from '../copy';
import { useShop } from '../data/shop-data';
import { lowerFirst } from '../format';
import { InfoNote, Tabs } from '../kit/bits';
import { useInks } from '../kit/inks';
import { ItemTile, TileGrid } from '../kit/item-tile';
import { Header, PaperPage } from '../kit/layout';
import { currentSeason } from '../kit/season';
import { SetCard } from '../kit/set-parts';
import { ShopFailed, ShopLoading } from '../kit/states';
import { SText } from '../kit/text';
import { closestSet } from '../sets';

type CollectionTab = Exclude<ShopItemKind, 'sticker_pack' | 'theme'> | 'sets';
const TABS: readonly CollectionTab[] = ['cottage', 'companion', 'coat', 'little_thing', 'sets'];

type Owned = Collection['items'][number];

/** Who a gift came from, by the names of the friends on visits this phone knows. */
function useGiverNames(): ReadonlyMap<string, string> {
  const { chats } = useCottage();
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const chat of chats) {
      if (chat.with?.name) names.set(chat.with.person, chat.with.name);
    }
    return names;
  }, [chats]);
}

export function CollectionScreen() {
  const shop = useShop();
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const { width } = useWindowDimensions();
  const givers = useGiverNames();
  const [tab, setTab] = useState<CollectionTab>('cottage');
  const owned = useMemo(
    () => new Set(shop.collection?.items.map((i) => i.item) ?? []),
    [shop.collection],
  );
  const progress = useMemo(
    () => closestSet(shop.catalog?.sets ?? [], owned),
    [owned, shop.catalog],
  );

  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;

  const season = currentSeason();
  const critter = shop.me?.critter ?? null;
  const tileW = (width - 32 - 10) / 2;
  const header = <Header title={t('shop.collection.title')} />;

  const label = (row: Owned): { text: string; wearing: boolean } => {
    const item = shop.item(row.item);
    if (item?.slot && critter && critter[item.slot] === row.item) {
      return { text: t('shop.collection.wearing'), wearing: true };
    }
    if (row.via === 'gift') {
      const from = row.from === null ? undefined : givers.get(row.from);
      return {
        text: from ? t('shop.collection.gift', { name: from }) : t('shop.collection.giftSomeone'),
        wearing: false,
      };
    }
    return { text: t(`shop.collection.${row.via}`), wearing: false };
  };

  if (shop.collection !== null && shop.collection.items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <EmptyState
          art={<ArtStill scene="cart" width={300} height={216} attrs={{ season }} t={1.2} />}
          title={t('shop.collection.empty.title')}
          body={t('shop.collection.empty.body')}
          action={{
            label: t('shop.collection.empty.action'),
            onPress: () => router.dismissTo('/shop'),
          }}
        />
        {header}
      </View>
    );
  }

  const rows = (shop.collection?.items ?? []).filter(
    (row) => tab !== 'sets' && shop.item(row.item)?.kind === tab,
  );
  const progressText = (() => {
    if (!progress) return null;
    const set = setName(t, progress.set.set);
    if (progress.missing.length === 0) {
      return t('shop.collection.setDone', { set, pose: setPose(t, progress.set.set) });
    }
    const first = progress.missing[0] ?? '';
    const name = itemName(t, first);
    return progress.missing.length === 1
      ? t('shop.collection.setOne', {
          set,
          have: progress.have,
          total: progress.total,
          item: language === 'en' ? lowerFirst(name) : name,
        })
      : t('shop.collection.setMany', { set, have: progress.have, total: progress.total });
  })();

  return (
    <PaperPage header={header} top={116} inset={16}>
      <Tabs
        tabs={TABS.map((id) => ({
          id,
          label: t(id === 'sets' ? 'shop.tab.sets' : `shop.tab.${id}`),
        }))}
        value={tab}
        onChange={setTab}
        inset={16}
      />
      {shop.collection === null ? (
        <ShopLoading />
      ) : tab === 'sets' ? (
        <View style={{ gap: 14 }}>
          {(shop.catalog?.sets ?? []).map((set) => (
            <SetCard
              key={set.set}
              set={set}
              items={shop.item}
              width={width - 32}
              season={season}
              onPress={() => router.push({ pathname: '/shop/set', params: { set: set.set } })}
            />
          ))}
        </View>
      ) : (
        <TileGrid>
          {rows.map((row) => {
            const item = shop.item(row.item);
            if (!item) return null;
            const name = itemName(t, row.item);
            const { text, wearing } = label(row);
            return (
              <ItemTile
                key={row.item}
                look={{ item: row.item, kind: item.kind, season }}
                name={name}
                width={tileW}
                artHeight={120}
                bottomPad={8}
                accessibilityLabel={`${name}, ${text}`}
                onPress={() => router.push({ pathname: '/shop/try', params: { item: row.item } })}
                trailing={
                  <SText s={11.5} w={600} color={wearing ? inks.link : palette.secondary}>
                    {text}
                  </SText>
                }
              />
            );
          })}
        </TileGrid>
      )}
      {progress && progressText ? (
        <Press
          onPress={() => router.push({ pathname: '/shop/set', params: { set: progress.set.set } })}
          radius={16}
          accessibilityRole="button"
          accessibilityLabel={progressText}
        >
          <InfoNote text={progressText} icon="rosette" tone="honey" />
        </Press>
      ) : null}
      <SText s={13} lh={1.45} multiline color={palette.secondary}>
        {t('shop.collection.keep')}
      </SText>
    </PaperPage>
  );
}
