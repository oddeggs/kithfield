import type {
  FarmId,
  PersonId,
  ShopCatalog,
  ShopItem,
  Species,
  Wishlist,
} from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useDataClient, useFarm } from '../../data/react';
import { ArtIcon } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { shopApi } from './api';
import { itemName } from './copy';
import { ItemArt } from './item-art';
import { Pill } from './kit/bits';
import { useInks } from './kit/inks';
import { birthdayToday, memberOf } from './kit/members';
import { currentSeason } from './kit/season';
import { SText } from './kit/text';

/*
 * A wishlist on a critter card: what someone is wishing for, which only members of a farm they
 * share can see, and nobody is told who looked.
 */

/** The label row over a wishlist: "WISHING FOR" and, on your own, "friends can see this". */
export function WishLabel({ own }: { readonly own: boolean }) {
  const { t } = useLocale();
  const inks = useInks();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <SText s={12} w={700} caps color={inks.label} accessibilityRole="header">
        {t('shop.wishlist.label')}
      </SText>
      {own ? (
        <SText s={13} color={inks.label}>
          {t('shop.wishlist.public')}
        </SText>
      ) : null}
    </View>
  );
}

/** Wished-for things three across: art 84 tall in a 12-radius tile, the name under it. */
export function WishTiles({
  items,
  species,
  width,
  onPress,
}: {
  readonly items: readonly ShopItem[];
  /** Whose critter the things are drawn on. */
  readonly species: Species | undefined;
  /** The row's width. */
  readonly width: number;
  readonly onPress?: (item: ShopItem) => void;
}) {
  const { t } = useLocale();
  const inks = useInks();
  const season = currentSeason();
  const tile = (width - 16) / 3;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => {
        const name = itemName(t, item.item);
        const body = (
          <>
            <View style={{ height: 84, borderRadius: 12, overflow: 'hidden' }}>
              <ItemArt
                look={{ item: item.item, kind: item.kind, season, ...(species ? { species } : {}) }}
                width={tile - 12}
                height={84}
              />
            </View>
            <SText s={12} lh={1.2} w={600} align="center" numberOfLines={1}>
              {name}
            </SText>
          </>
        );
        const card = {
          width: tile,
          borderRadius: 16,
          backgroundColor: inks.tile,
          padding: 6,
          gap: 4,
        } as const;
        return onPress ? (
          <Press
            key={item.item}
            onPress={() => onPress(item)}
            radius={16}
            accessibilityRole="button"
            accessibilityLabel={name}
            style={card}
          >
            {body}
          </Press>
        ) : (
          <View key={item.item} style={card} accessible accessibilityLabel={name}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/** The plum note on your own card: friends see the list on your birthday. */
export function BirthdayNote({ name }: { readonly name: string }) {
  const { t } = useLocale();
  const inks = useInks();
  const { palette } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: inks.wish.bg,
      }}
    >
      <ArtIcon name="rosette" size={22} color={palette.text} />
      <SText s={13} lh={1.4} color={inks.wish.fg} multiline style={{ flex: 1 }}>
        {t('shop.wishlist.birthday', { name })}
      </SText>
    </View>
  );
}

/** Wished items in the wishlist's order, as catalogue items (unknown ones left out). */
export function wishedItems(wishlist: Wishlist | null, catalog: ShopCatalog | null): ShopItem[] {
  if (!wishlist || !catalog) return [];
  const byId = new Map(catalog.items.map((i) => [i.item, i]));
  return wishlist.items.flatMap((w) => {
    const found = byId.get(w.item);
    return found ? [found] : [];
  });
}

/** The catalogue, asked for once per app run by cards outside the shop. */
let catalogOnce: Promise<ShopCatalog> | null = null;

/**
 * A wishlist for a critter card on a farm, outside the shop: your own (with the birthday note),
 * or a friend's, where each thing leads to leaving it on their step and, on their birthday, to
 * chipping in together. On any failure it says so in one quiet line.
 */
export function WishlistShelf({
  farm,
  person,
  own,
  width,
}: {
  readonly farm: FarmId;
  readonly person: PersonId;
  readonly own: boolean;
  /** The card's inner width. */
  readonly width: number;
}) {
  const { api } = useDataClient();
  const { t } = useLocale();
  const { palette } = useTheme();
  const me = useSession().person?.id ?? null;
  const state = useFarm(farm)?.state ?? null;
  const shop = useMemo(() => shopApi(api), [api]);
  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    catalogOnce ??= shop.catalog().catch((error: unknown) => {
      catalogOnce = null;
      throw error;
    });
    Promise.all([catalogOnce, own ? shop.wishlist() : shop.friendsWishlist(farm, person)]).then(
      ([cat, list]) => {
        if (!live) return;
        setCatalog(cat);
        setWishlist(list);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [shop, own, farm, person]);

  const member = memberOf(state, person);
  const name = member?.name ?? '';
  const items = wishedItems(wishlist, catalog);
  const birthday = !own && me !== person && birthdayToday(state, person, Date.now());

  if (failed) {
    return (
      <SText s={13} lh={1.4} color={palette.secondary}>
        {t('shop.wishlist.loadFailed')}
      </SText>
    );
  }
  if (!wishlist) return null;
  return (
    <View style={{ gap: 12 }}>
      <WishLabel own={own} />
      {items.length === 0 ? (
        <SText s={13} lh={1.4} color={palette.secondary} multiline>
          {own ? t('shop.wishlist.empty') : t('shop.wishlist.friendEmpty', { name })}
        </SText>
      ) : (
        <WishTiles
          items={items}
          species={member?.critter.species}
          width={width}
          {...(own
            ? {
                onPress: (item: ShopItem) =>
                  router.push({ pathname: '/shop/try', params: { item: item.item } }),
              }
            : {
                onPress: (item: ShopItem) =>
                  router.push({
                    pathname: '/shop/gift',
                    params: { farm, to: person, item: item.item },
                  }),
              })}
        />
      )}
      {own && name !== '' ? <BirthdayNote name={name} /> : null}
      {birthday && items.length > 0 ? (
        <Pill
          label={t('shop.wishlist.chipIn')}
          kind="plum"
          icon="sparkle"
          size={16}
          onPress={() => router.push({ pathname: '/shop/chip-in', params: { farm, to: person } })}
        />
      ) : null}
    </View>
  );
}
