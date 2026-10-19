import type { FarmId, MemberState } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ArtStill } from '../../../ui/art/art-view';
import { castOf, sceneLook } from '../../../ui/art/critter-look';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useShop } from '../data/shop-data';
import { useInks } from '../kit/inks';
import { Header, HeroSheet } from '../kit/layout';
import { memberOf, useFarmState } from '../kit/members';
import { currentSeason, useShopParams } from '../kit/season';
import { ScreenLoading } from '../kit/screen-loading';
import { ShopFailed, ShopLoading } from '../kit/states';
import { SText } from '../kit/text';
import { BirthdayNote, WishLabel, WishTiles, wishedItems } from '../wishlist-shelf';

/** The crowd is 260 tall; the sheet comes up over it from 230. */
const HERO = 260;
const SHEET = 230;
/** The friends drawn beside you when no farm is given (as the design draws them). */
const FRIENDS = ['hedgehog/////', 'owl/////', 'frog/////'];

function WishlistBody({ member }: { readonly member: MemberState | null }) {
  const shop = useShop();
  const { t } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const { width } = useWindowDimensions();
  const season = currentSeason();
  const critter = shop.me?.critter ?? null;
  const name = shop.me?.name ?? '';
  const items = wishedItems(shop.wishlist, shop.catalog);
  const cast = useMemo(
    () => [critter ? castOf(critter) : 'rabbit/////', ...FRIENDS].join(','),
    [critter],
  );
  const who = critter
    ? member
      ? t('shop.wishlist.who', {
          species: t(`shop.species.${critter.species}`),
          battery: t(member.battery === 'open' ? 'shop.wishlist.lampOn' : 'shop.wishlist.resting'),
        })
      : t(`shop.species.${critter.species}`)
    : '';
  return (
    <HeroSheet
      artHeight={HERO}
      sheetTop={SHEET}
      art={<ArtStill scene="crowd" width={width} height={HERO} attrs={{ season, cast }} t={1.2} />}
      header={<Header />}
    >
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View
          style={{
            width: 96,
            height: 100,
            borderRadius: 24,
            backgroundColor: inks.critterStage,
            overflow: 'hidden',
          }}
        >
          {critter ? (
            <ArtStill
              scene="stage"
              width={96}
              height={100}
              attrs={{ ...sceneLook(critter), season }}
              t={1.2}
            />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <SText f="serif" s={28} lh={1.12} accessibilityRole="header">
            {name}
          </SText>
          <SText s={13.5} lh={1.3} color={palette.secondary}>
            {who}
          </SText>
        </View>
      </View>
      <WishLabel own />
      {shop.wishlist === null ? (
        shop.wishlistFailed ? (
          <SText s={13} lh={1.4} color={palette.secondary} multiline>
            {t('shop.failed')}
          </SText>
        ) : (
          <ShopLoading />
        )
      ) : items.length === 0 ? (
        // Said only once the wishlist has come: never "nothing yet" while it loads.
        <SText s={13} lh={1.4} color={palette.secondary} multiline>
          {t('shop.wishlist.empty')}
        </SText>
      ) : (
        <WishTiles
          items={items}
          species={critter?.species}
          width={width - 40}
          onPress={(item) => router.push({ pathname: '/shop/try', params: { item: item.item } })}
        />
      )}
      {name !== '' ? <BirthdayNote name={name} /> : null}
    </HeroSheet>
  );
}

function OnFarm({ farm }: { readonly farm: FarmId }) {
  const shop = useShop();
  const state = useFarmState(farm);
  return <WishlistBody member={memberOf(state, shop.person)} />;
}

/** Your wishlist as friends see it on your critter card. */
export function WishlistScreen() {
  const shop = useShop();
  const { farm } = useShopParams('farm');
  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;
  if (shop.loading) return <ScreenLoading />;
  return farm === '' ? <WishlistBody member={null} /> : <OnFarm farm={farm} />;
}
