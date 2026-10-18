import type { ShopItem } from '@kithfield/contracts';
import { motion, shopInks, shopMotion } from '@kithfield/theme';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ArtStill } from '../../../ui/art/art-view';
import { sceneLook } from '../../../ui/art/critter-look';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { Press } from '../../../ui/motion/press';
import { cartTitle, itemName } from '../copy';
import { useShop } from '../data/shop-data';
import {
  itemsFor,
  lowerFirst,
  monthName,
  onCartNow,
  productsOf,
  roundNote,
  splitForNote,
  type CartTab,
} from '../format';
import { useInks } from '../kit/inks';
import { Eyebrow, InfoNote, Tabs, Tag, Title } from '../kit/bits';
import { ItemTile, TileGrid } from '../kit/item-tile';
import { goBack, Header, HeroSheet, RoundButton, useDesignTop } from '../kit/layout';
import { currentSeason } from '../kit/season';
import { ShopFailed, ShopLoading } from '../kit/states';
import { SText } from '../kit/text';

/** The cart's hero is 330 tall; the sheet comes up over it from 296. */
const HERO = 330;
const SHEET = 296;
/** The cart rolls in once per visit, drawn on twos. */
const ROLL_MS = shopMotion.cartRollMs;

/** The cart arriving from the left, held a drawing at a time at 12 a second (on the UI thread). */
function RollingCart({ width, height }: { readonly width: number; readonly height: number }) {
  const shop = useShop();
  const reduce = useReduceMotion();
  const critter = shop.me?.critter ?? null;
  const attrs = useMemo(() => {
    const look = critter
      ? sceneLook(critter)
      : { kind: 'rabbit', outfit: 'scarf', ocolor: shopInks.day.defaultOutfit };
    return { ...look, season: currentSeason() };
  }, [critter]);
  const progress = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) progress.set(withTiming(1, { duration: ROLL_MS, easing: Easing.linear }));
  }, [progress, reduce]);
  const steps = Math.round(ROLL_MS / motion.twos.frameMs);
  const roll = useAnimatedStyle(() => {
    const held = Math.floor(progress.get() * steps) / steps;
    const eased = 1 - (1 - held) * (1 - held);
    return {
      transform: [{ translateX: -width * 0.4 * (1 - eased) }],
      opacity: Math.min(1, held * 3),
    };
  });
  return (
    <Animated.View style={[{ width, height }, roll]}>
      <ArtStill scene="cart" width={width} height={height} attrs={attrs} t={1.2} />
    </Animated.View>
  );
}

const TABS: readonly CartTab[] = ['week', 'cottage', 'companion', 'coat', 'little_thing', 'theme'];

export function CartScreen() {
  const shop = useShop();
  const { t, language } = useLocale();
  const inks = useInks();
  const top = useDesignTop();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<CartTab>('week');
  const week = useMemo(() => shop.cart?.items ?? [], [shop.cart]);
  const items = useMemo(
    () => itemsFor(tab, shop.catalog?.items ?? [], week),
    [shop.catalog, tab, week],
  );
  const owned = useMemo(() => new Set(shop.entitlements?.owned ?? []), [shop.entitlements]);
  const { loadPrices } = shop;
  useEffect(() => {
    loadPrices(productsOf(items));
  }, [items, loadPrices]);

  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;

  const tileW = (width - 40 - 10) / 2;
  const open = (item: ShopItem) => {
    if (item.kind === 'theme')
      router.push({ pathname: '/shop/theme', params: { theme: item.item } });
    else if (item.kind === 'sticker_pack')
      router.push({ pathname: '/shop/item', params: { item: item.item } });
    else router.push({ pathname: '/shop/try', params: { item: item.item } });
  };
  const tagFor = (item: ShopItem) => {
    if (owned.has(item.item)) return <Tag text={t('shop.cart.owned')} kind="owned" />;
    if (item.kind === 'theme') return null;
    if (item.product === null) return <Tag text={t('shop.patronsBadge')} kind="patrons" />;
    if (!onCartNow(item, week)) return null;
    return <Tag text={shop.priceText(item.product)} />;
  };
  /** Off the cart this week: when it comes back, under the name. */
  const backLine = (item: ShopItem) =>
    !owned.has(item.item) && item.back !== null && !onCartNow(item, week) && item.kind !== 'theme'
      ? t('shop.cart.back', { season: t(`shop.season.${item.back.season}`) })
      : undefined;
  const note = tab === 'week' ? roundNote(items) : null;
  // English puts the name mid-sentence ("The lighthouse"); Vietnamese starts the sentence with it.
  const midName = (id: string) =>
    language === 'en' ? lowerFirst(itemName(t, id)) : itemName(t, id);
  const season = currentSeason();

  // The note sits under the first two rows, where the design shows it; the rest follow it.
  const [above, below] = note ? splitForNote(items) : [items, []];
  const tile = (item: ShopItem) => {
    const name = itemName(t, item.item);
    return (
      <ItemTile
        key={item.item}
        look={{ item: item.item, kind: item.kind, season, night: item.item === 'lighthouse' }}
        name={name}
        width={tileW}
        artHeight={112}
        trailing={tagFor(item)}
        below={backLine(item)}
        onPress={() => open(item)}
        accessibilityLabel={name}
      />
    );
  };

  return (
    <HeroSheet
      art={<RollingCart width={width} height={top(HERO)} />}
      artHeight={HERO}
      sheetTop={SHEET}
      header={
        <Header
          onBack={goBack}
          right={
            <RoundButton
              icon="heart"
              label={t('shop.cart.wishlist')}
              onPress={() => router.push('/shop/wishlist')}
            />
          }
        />
      }
    >
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <View style={{ flex: 1 }}>
          <Eyebrow text={t('shop.cart.eyebrow')} />
          {shop.cart ? <Title text={cartTitle(t, shop.cart.name)} /> : null}
        </View>
        <Press
          onPress={() => router.push('/shop/collection')}
          darken={false}
          accessibilityRole="link"
          accessibilityLabel={t('shop.cart.collection')}
          hitSlop={10}
          style={{ paddingTop: 6 }}
        >
          <SText s={14} w={600} color={inks.link}>
            {t('shop.cart.collection')}
          </SText>
        </Press>
      </View>
      <Tabs
        tabs={TABS.map((id) => ({ id, label: t(`shop.tab.${id}`) }))}
        value={tab}
        onChange={setTab}
        inset={20}
      />
      {shop.loading && !shop.catalog ? <ShopLoading /> : <TileGrid>{above.map(tile)}</TileGrid>}
      {tab === 'coat' ? <InfoNote text={t('shop.cart.coatsNote')} /> : null}
      {note ? (
        <InfoNote
          text={
            note.last
              ? t('shop.cart.round', {
                  item: midName(note.item.item),
                  month: monthName(language, note.last),
                  season: t(`shop.season.${note.back}`),
                })
              : t('shop.cart.roundNew', {
                  item: midName(note.item.item),
                  season: t(`shop.season.${note.back}`),
                })
          }
        />
      ) : null}
      {below.length > 0 ? <TileGrid>{below.map(tile)}</TileGrid> : null}
    </HeroSheet>
  );
}
