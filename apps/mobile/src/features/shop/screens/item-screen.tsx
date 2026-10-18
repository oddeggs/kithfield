import type { FarmId, MemberState, ShopItem, Species } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ApiError } from '../../../data';
import { lookOf } from '../../../ui/art/critter-look';
import { Avatar } from '../../../ui/art/avatar';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { itemBlurb, itemName } from '../copy';
import { useShop } from '../data/shop-data';
import { lowerFirst } from '../format';
import { ItemArt } from '../item-art';
import { Pill } from '../kit/bits';
import { Header, HeroSheet } from '../kit/layout';
import { memberOf, useFarmState } from '../kit/members';
import { currentSeason, useShopParams } from '../kit/season';
import { ScreenLoading } from '../kit/screen-loading';
import { ShopFailed } from '../kit/states';
import { SText } from '../kit/text';

/** The item's hero is 420 tall; the sheet comes up over it from 470. */
const HERO = 420;
const SHEET = 470;

/** "Cottage style · on the cart this week", or when it comes back. */
function useWhen(item: ShopItem): string {
  const shop = useShop();
  const { t } = useLocale();
  const kind = t(`shop.kind.${item.kind}`);
  if (shop.cart?.items.includes(item.item) === true) return t('shop.item.onCart', { kind });
  if (item.back !== null) {
    return t('shop.item.backOn', { kind, season: t(`shop.season.${item.back.season}`) });
  }
  return kind;
}

function ItemSheet({
  item,
  friend,
}: {
  readonly item: ShopItem;
  readonly friend: MemberState | null;
}) {
  const shop = useShop();
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const when = useWhen(item);
  const wished = shop.wishlist?.items.some((w) => w.item === item.item) === true;
  const [busy, setBusy] = useState(false);
  const name = itemName(t, item.item);
  const friendName = friend?.name ?? null;
  const title =
    friendName === null
      ? name
      : t('shop.item.friends', {
          name: friendName,
          item: language === 'en' ? lowerFirst(name) : name,
        });
  const species: Species | undefined = friend?.critter.species ?? shop.me?.critter?.species;
  const season = currentSeason();
  const wardrobe = item.kind !== 'sticker_pack' && item.kind !== 'theme';

  const toggleWish = async () => {
    setBusy(true);
    try {
      if (wished) await shop.api.unwish(item.item);
      else await shop.api.wish(item.item);
      await shop.refreshWishlist();
    } catch (error) {
      toast.show(
        error instanceof ApiError && error.code === 'conflict'
          ? t('shop.wish.full')
          : t('shop.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <HeroSheet
      artHeight={HERO}
      sheetTop={SHEET}
      art={
        <ItemArt
          look={{ item: item.item, kind: item.kind, season, ...(species ? { species } : {}) }}
          width={width}
          height={HERO}
          moving={item.kind === 'cottage'}
        />
      }
      header={<Header title={title} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {friend ? (
          <Avatar kind={friend.critter.species} look={lookOf(friend.critter)} size={44} />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden' }}>
            <ItemArt
              look={{ item: item.item, kind: item.kind, season, bare: true }}
              width={44}
              height={44}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <SText s={16} lh={1.2} w={600}>
            {title}
          </SText>
          <SText s={13} lh={1.3} color={palette.secondary}>
            {when}
          </SText>
        </View>
      </View>
      <SText s={14.5} lh={1.45} color={palette.body} multiline>
        {t('shop.item.wishBody', { blurb: itemBlurb(t, item.item) })}
      </SText>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {wardrobe ? (
          <Pill
            label={t('shop.item.tryOn')}
            kind="soft"
            size={16}
            flex={1}
            onPress={() => router.push({ pathname: '/shop/try', params: { item: item.item } })}
          />
        ) : null}
        <Pill
          label={wished ? t('shop.item.wished') : t('shop.item.wish')}
          kind="plum"
          icon="sparkle"
          size={16}
          flex={1.2}
          busy={busy}
          onPress={() => void toggleWish()}
        />
      </View>
      <SText s={12.5} lh={1.45} color={palette.secondary} multiline>
        {friendName === null
          ? t('shop.item.privateOwn')
          : t('shop.item.private', { name: friendName })}
      </SText>
    </HeroSheet>
  );
}

function FriendsItem({
  item,
  farm,
  person,
}: {
  readonly item: ShopItem;
  readonly farm: FarmId;
  readonly person: string;
}) {
  const state = useFarmState(farm);
  return <ItemSheet item={item} friend={memberOf(state, person)} />;
}

/** A thing seen on a friend (or on the cart): what it is, try it on, wish for it. */
export function ItemScreen() {
  const shop = useShop();
  const { item: id, farm, person } = useShopParams('item', 'farm', 'person');
  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;
  const item = shop.item(id);
  if (!item) return shop.loading ? <ScreenLoading /> : <ShopFailed onRetry={shop.reload} />;
  return farm !== '' && person !== '' ? (
    <FriendsItem item={item} farm={farm} person={person} />
  ) : (
    <ItemSheet item={item} friend={null} />
  );
}
