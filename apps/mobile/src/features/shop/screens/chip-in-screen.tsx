import type { ChipIn, FarmId, StoreProductId, Wishlist } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useOpenFarm } from '../../../data/react';
import { ArtStill } from '../../../ui/art/art-view';
import { lookOf } from '../../../ui/art/critter-look';
import { Avatar } from '../../../ui/art/avatar';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { TierPicker } from '../chip/tier-picker';
import { useChipIns } from '../chip/use-chip-ins';
import { itemName } from '../copy';
import { usePledge } from '../data/flows';
import { chipNoteKey } from '../chip/note';
import { useShop } from '../data/shop-data';
import { fillWord, lowerFirst } from '../format';
import { ItemArt } from '../item-art';
import { Eyebrow, InfoNote, Pill, Progress, Title } from '../kit/bits';
import { useInks } from '../kit/inks';
import { Header, HeroSheet } from '../kit/layout';
import { birthdayToday, memberOf, useFarmState } from '../kit/members';
import { ScreenLoading } from '../kit/screen-loading';
import { currentSeason, useShopParams } from '../kit/season';
import { ShopFailed } from '../kit/states';
import { SText } from '../kit/text';

/** The birthday bloom is 330 tall; the sheet comes up over it from 300. */
const HERO = 330;
const SHEET = 300;

const FILL_KEY = {
  start: 'shop.chip.start',
  filling: 'shop.chip.filling',
  nearly: 'shop.chip.nearly',
  covered: 'shop.chip.covered',
} as const;

function ChipInSheet({
  farm,
  to,
  item: wanted,
}: {
  readonly farm: FarmId;
  readonly to: string;
  readonly item: string;
}) {
  useOpenFarm(farm);
  const shop = useShop();
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const state = useFarmState(farm);
  const pledge = usePledge();
  const { chipIns, tiers, put } = useChipIns(farm);
  const [wishes, setWishes] = useState<Wishlist | null>(null);
  const [picking, setPicking] = useState(false);
  const { api, loadPrices } = shop;
  useEffect(() => {
    let live = true;
    api.friendsWishlist(farm, to).then(
      (w) => live && setWishes(w),
      () => live && setWishes({ items: [] }),
    );
    return () => {
      live = false;
    };
  }, [api, farm, to]);
  useEffect(() => {
    loadPrices(tiers);
  }, [loadPrices, tiers]);

  const friend = memberOf(state, to);
  const name = friend?.name ?? t('shop.chip.friend');
  const itemId = wanted !== '' ? wanted : (wishes?.items[0]?.item ?? '');
  const item = itemId === '' ? null : shop.item(itemId);
  const chipIn: ChipIn | null =
    chipIns?.find(
      (c) =>
        c.what.for === 'gift' && c.what.to === to && c.what.item === itemId && c.state !== 'closed',
    ) ?? null;

  const pick = useCallback(
    async (tier: StoreProductId) => {
      let current = chipIn;
      if (current === null) {
        try {
          current = await shop.api.startChipIn(farm, {
            for: 'gift',
            to,
            item: itemId,
            wrap: 'clay',
          });
        } catch {
          toast.show(t('shop.failed'));
          return;
        }
      }
      const next = await pledge.promise(current.chipIn, tier);
      if (next) {
        put(next);
        setPicking(false);
      }
    },
    [chipIn, farm, itemId, pledge, put, shop.api, t, to, toast],
  );

  const pay = async () => {
    if (!chipIn?.mine) return;
    const next = await pledge.pay(farm, chipIn.chipIn);
    if (next) {
      put(next);
      if (next.mine?.state === 'paid') toast.show(t('shop.chip.paid'));
    }
  };

  const hero = (
    <ArtStill
      scene="bloom"
      width={width}
      height={HERO}
      attrs={{ season: currentSeason() }}
      t={1.2}
    />
  );
  const header = <Header />;

  if (state !== null && !birthdayToday(state, to, Date.now())) {
    return (
      <HeroSheet art={hero} artHeight={HERO} sheetTop={SHEET} header={header}>
        <InfoNote text={t('shop.chip.notBirthday')} tone="plum" icon="rosette" />
        <Pill
          label={t('shop.gift.pick', { name })}
          kind="soft"
          size={16}
          onPress={() => router.replace({ pathname: '/shop/gift', params: { farm, to } })}
        />
      </HeroSheet>
    );
  }
  if (wishes !== null && item === null) {
    return (
      <HeroSheet art={hero} artHeight={HERO} sheetTop={SHEET} header={header}>
        <Eyebrow text={t('shop.chip.birthday', { name })} tone="plum" />
        <InfoNote text={t('shop.chip.noWishes', { name })} tone="plum" icon="rosette" />
        <Pill
          label={t('shop.gift.pick', { name })}
          kind="plum"
          size={16}
          onPress={() => router.replace({ pathname: '/shop/gift', params: { farm, to } })}
        />
      </HeroSheet>
    );
  }
  if (item === null) return <ScreenLoading />;

  const label = itemName(t, item.item);
  const filled = chipIn?.filled ?? 0;
  const mine = chipIn?.mine ?? null;
  const note = t(chipNoteKey(chipIn?.state ?? 'open', mine?.state ?? null), { name });

  const action = (() => {
    if (mine && chipIn?.state === 'covered' && mine.state === 'promised') {
      const price = shop.prices[mine.tier];
      return (
        <Pill
          label={price ? t('shop.chip.pay', { price }) : t('shop.chip.payFree')}
          kind="plum"
          size={16}
          busy={pledge.state === 'busy'}
          onPress={() => void pay()}
        />
      );
    }
    if (mine) {
      return (
        <InfoNote
          text={mine.state === 'paid' ? t('shop.chip.paid') : t('shop.chip.pledged')}
          tone="plum"
          icon="check"
        />
      );
    }
    if (picking) {
      return (
        <TierPicker
          tiers={tiers}
          prices={shop.prices}
          busy={pledge.state === 'busy'}
          tone="plum"
          onPick={(tier) => void pick(tier)}
        />
      );
    }
    return (
      <Pill label={t('shop.chip.button')} kind="plum" size={16} onPress={() => setPicking(true)} />
    );
  })();

  return (
    <HeroSheet art={hero} artHeight={HERO} sheetTop={SHEET} header={header}>
      <Eyebrow text={t('shop.chip.birthday', { name })} tone="plum" />
      <Title text={t('shop.chip.title', { item: language === 'en' ? lowerFirst(label) : label })} />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 90, height: 90, borderRadius: 18, overflow: 'hidden' }}>
          <ItemArt
            look={{
              item: item.item,
              kind: item.kind,
              season: currentSeason(),
              ...(friend ? { species: friend.critter.species } : {}),
            }}
            width={90}
            height={90}
          />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <SText s={15} lh={1.2} w={600}>
            {t('shop.chip.fromWishlist', { name })}
          </SText>
          <Progress value={filled} tone="plum" label={t(FILL_KEY[fillWord(filled)])} />
          <SText s={13} lh={1.3} color={palette.secondary}>
            {t(FILL_KEY[fillWord(filled)])}
          </SText>
        </View>
      </View>
      {chipIn && chipIn.people.length > 0 ? (
        <View>
          {chipIn.people.map((person) => {
            const m = memberOf(state, person);
            if (!m) return null;
            return (
              <View
                key={person}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: inks.rowRule,
                }}
              >
                <Avatar kind={m.critter.species} look={lookOf(m.critter)} size={28} />
                <SText s={14.5} w={600} style={{ flex: 1 }} numberOfLines={1}>
                  {m.name ?? ''}
                </SText>
                <SText s={13} color={palette.secondary}>
                  {t('shop.chip.chippedIn')}
                </SText>
              </View>
            );
          })}
        </View>
      ) : null}
      <SText s={12.5} lh={1.45} color={palette.secondary} multiline>
        {note}
      </SText>
      {chipIn?.state === 'closed' ? null : action}
    </HeroSheet>
  );
}

/** A friend's birthday: chip in together on something from their wishlist. */
export function ChipInScreen() {
  const shop = useShop();
  const { farm, to, item } = useShopParams('farm', 'to', 'item');
  // The friend a chip-in is for never sees it.
  if (shop.failed || farm === '' || to === '' || to === shop.person) {
    return <ShopFailed onRetry={shop.reload} />;
  }
  if (shop.loading) return <ScreenLoading />;
  return <ChipInSheet farm={farm} to={to} item={item} />;
}
