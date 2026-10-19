import { LIMITS, Species, type FarmId, type ShopItem, type Wishlist } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { TextField } from '../../../ui/components/text-field';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { TravelAnchor, timing, travelIds, useTravel } from '../../../ui/travel';
import { itemName } from '../copy';
import { useGiveGift } from '../data/flows';
import { useShop } from '../data/shop-data';
import { monthName } from '../format';
import { ItemArt } from '../item-art';
import { Pill, ringStyle, Title } from '../kit/bits';
import { useInks } from '../kit/inks';
import { ItemTile, TileGrid } from '../kit/item-tile';
import { Header, PaperPage } from '../kit/layout';
import { memberOf, useFarmState } from '../kit/members';
import { ScreenLoading } from '../kit/screen-loading';
import { currentSeason, useShopParams } from '../kit/season';
import { ShopFailed } from '../kit/states';
import { SText } from '../kit/text';
import { wishedItems } from '../wishlist-shelf';

/** The gift's stage, where the parcel ties up before it hops to the friend's step. */
const STAGE_ID = 'shop:gift-stage';
const PARCEL = { width: 110, height: 96 };
const GIFT_MS = timing('gift', 'total');
/** The gift screen closes by then even if the parcel never set off. */
const CLOSE_AT_LATEST_MS = GIFT_MS * 0.25 + 250;

/** The five free wrappings, in the design's order. */
export const WRAP_IDS = ['clay', 'dusk', 'fern', 'brown_paper', 'plum'] as const;
export type WrapId = (typeof WRAP_IDS)[number];
export const isWrapId = (id: string): id is WrapId => (WRAP_IDS as readonly string[]).includes(id);

/** A wrapping: paper with the honey ribbon crossing it, 56 × 50. */
export function WrapSwatch({
  wrap,
  on,
  onPress,
}: {
  readonly wrap: WrapId;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  const inks = useInks();
  const { t } = useLocale();
  const label = t(`shop.wrap.${wrap}`);
  return (
    <Press
      onPress={onPress}
      haptic="select"
      darken={false}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={{ alignItems: 'center', gap: 5 }}
    >
      <View
        style={[
          {
            width: 56,
            height: 50,
            borderRadius: 12,
            backgroundColor: inks.wraps[wrap],
            overflow: 'hidden',
          },
          on
            ? ringStyle(true, inks.ringGap, inks.ring, inks.swatchEdge)
            : { boxShadow: `inset 0 0 0 1px ${inks.swatchEdge}` },
        ]}
      >
        <View
          style={{
            position: 'absolute',
            left: 24,
            top: 0,
            bottom: 0,
            width: 8,
            backgroundColor: inks.ribbon,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 21,
            left: 0,
            right: 0,
            height: 8,
            backgroundColor: inks.ribbon,
          }}
        />
      </View>
      <SText s={11.5} w={600} numberOfLines={1}>
        {label}
      </SText>
    </Press>
  );
}

/** Choosing what to give when nothing was picked yet: their wishes first, then this week's cart. */
function GiftPicker({
  farm,
  to,
  name,
  wishes,
}: {
  readonly farm: FarmId;
  readonly to: string;
  readonly name: string;
  readonly wishes: Wishlist | null;
}) {
  const shop = useShop();
  const { t } = useLocale();
  const { width } = useWindowDimensions();
  const season = currentSeason();
  const items = useMemo(() => {
    const wished = wishedItems(wishes, shop.catalog);
    const cart = (shop.cart?.items ?? []).flatMap((id) => {
      const found = shop.item(id);
      return found ? [found] : [];
    });
    const seen = new Set<string>();
    return [...wished, ...cart].filter((i) => {
      if (i.giftProduct === null || seen.has(i.item)) return false;
      seen.add(i.item);
      return true;
    });
  }, [shop, wishes]);
  const tile = (width - 50) / 2;
  return (
    <PaperPage header={<Header title={t('shop.gift.title', { name })} glass={false} />}>
      <Title text={t('shop.gift.pick', { name })} size={24} />
      <TileGrid>
        {items.map((item) => (
          <ItemTile
            key={item.item}
            look={{ item: item.item, kind: item.kind, season }}
            name={itemName(t, item.item)}
            width={tile}
            artHeight={112}
            accessibilityLabel={itemName(t, item.item)}
            onPress={() => router.setParams({ farm, to, item: item.item })}
          />
        ))}
      </TileGrid>
    </PaperPage>
  );
}

function GiftChoice({
  farm,
  to,
  name,
  item,
  wishes,
  gate,
  species,
}: {
  readonly farm: FarmId;
  readonly to: string;
  readonly name: string;
  readonly item: ShopItem;
  readonly wishes: Wishlist | null;
  /** Left at the gate of `farm`, the farm being visited. */
  readonly gate: boolean;
  /** The friend's critter, when the phone doesn't hold their farm (a gate). */
  readonly species: string;
}) {
  const shop = useShop();
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { state, give } = useGiveGift(farm);
  const travel = useTravel();
  const wraps = (shop.catalog?.wraps ?? WRAP_IDS).filter(isWrapId);
  const [wrap, setWrap] = useState<WrapId>(wraps[0] ?? 'clay');
  const [note, setNote] = useState('');
  const friendSpecies =
    memberOf(useFarmState(farm), to)?.critter.species ?? Species.safeParse(species).data;
  const wished = wishes?.items.find((w) => w.item === item.item) ?? null;
  const { loadPrices } = shop;
  useEffect(() => {
    if (item.giftProduct !== null) loadPrices([item.giftProduct]);
  }, [item.giftProduct, loadPrices]);
  const price = item.giftProduct === null ? null : shop.priceText(item.giftProduct);
  const stageW = width - 56;

  const leave = async () => {
    const outcome = await give({
      farm,
      to,
      item: item.item,
      wrap,
      ...(note.trim() === '' ? {} : { note: note.trim() }),
      ...(gate ? { gate } : {}),
    });
    if (outcome === 'given') {
      toast.show(t(gate ? 'shop.gift.leftAtGate' : 'shop.gift.left', { name }));
      if (gate) return router.back();
      // The parcel ties up on the stage, then hops down to the friend's step on the farm below
      // as this screen closes (signature motion).
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        router.back();
      };
      travel.fly({
        from: STAGE_ID,
        to: travelIds.farmDoor(farm, to),
        sprite: {
          scene: 'gift',
          attrs: { color: inks.wraps[wrap] ?? inks.giftStage },
          ...PARCEL,
          at: 0.3,
          drawings: 2,
        },
        fromWidth: PARCEL.width,
        hops: { count: 2, height: 30 },
        arc: 20,
        delayMs: GIFT_MS * 0.25,
        durationMs: GIFT_MS * 0.4,
        holdMs: GIFT_MS * 0.1,
        hideSource: false,
        onStart: close,
        onReturned: close,
      });
      setTimeout(close, CLOSE_AT_LATEST_MS);
    } else if (outcome === 'owned') toast.show(t('shop.gift.owned', { name }));
    else if (outcome === 'unavailable') toast.show(t('shop.gift.cant'));
  };

  return (
    <PaperPage
      top={110}
      header={<Header title={t('shop.gift.title', { name })} glass={false} />}
      footer={
        <Pill
          label={
            gate
              ? price === null
                ? t('shop.gift.leaveAtGateFree')
                : t('shop.gift.leaveAtGate', { price })
              : price === null
                ? t('shop.gift.leaveFree')
                : t('shop.gift.leave', { price })
          }
          kind="ink"
          size={16}
          busy={state === 'busy'}
          disabled={item.giftProduct === null || !shop.store.available}
          onPress={() => void leave()}
        />
      }
    >
      <TravelAnchor
        id={STAGE_ID}
        style={{
          marginHorizontal: 8,
          marginBottom: 6,
          height: 240,
          borderTopLeftRadius: 120,
          borderTopRightRadius: 120,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
          overflow: 'hidden',
          backgroundColor: inks.giftStage,
        }}
      >
        <ItemArt
          look={{
            item: item.item,
            kind: item.kind,
            season: currentSeason(),
            tile: inks.giftStage,
            ...(friendSpecies ? { species: friendSpecies } : {}),
          }}
          width={stageW}
          height={240}
        />
      </TravelAnchor>
      <Title text={itemName(t, item.item)} size={24} />
      <SText s={14.5} lh={1.45} color={palette.body} multiline>
        {wished
          ? t('shop.gift.wished', { name, month: monthName(language, wished.at) })
          : t(gate ? 'shop.gift.waitingAtGate' : 'shop.gift.waiting', { name })}
      </SText>
      <SText s={12} w={700} caps color={inks.label} accessibilityRole="header">
        {t('shop.gift.wrapping')}
      </SText>
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between' }}
        accessibilityRole="radiogroup"
      >
        {wraps.map((w) => (
          <WrapSwatch key={w} wrap={w} on={w === wrap} onPress={() => setWrap(w)} />
        ))}
      </View>
      <TextField
        value={note}
        onChangeText={setNote}
        placeholder={t('shop.gift.tag')}
        maxLength={LIMITS.giftNote}
        accessibilityLabel={t('shop.gift.tag')}
        returnKeyType="done"
      />
    </PaperPage>
  );
}

function GiftFor({
  farm,
  to,
  item,
  gate,
  friend,
  species,
}: {
  readonly farm: FarmId;
  readonly to: string;
  readonly item: string;
  readonly gate: boolean;
  /** The friend's name, when the phone doesn't hold their farm (a gate). */
  readonly friend: string;
  readonly species: string;
}) {
  const shop = useShop();
  const { t } = useLocale();
  const state = useFarmState(farm);
  const [wishes, setWishes] = useState<Wishlist | null>(null);
  const { api } = shop;
  useEffect(() => {
    let live = true;
    api.friendsWishlist(farm, to).then(
      (w) => live && setWishes(w),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api, farm, to]);
  const name = memberOf(state, to)?.name ?? (friend === '' ? t('shop.gift.friend') : friend);
  const chosen = item === '' ? null : shop.item(item);
  return chosen ? (
    <GiftChoice
      farm={farm}
      to={to}
      name={name}
      item={chosen}
      wishes={wishes}
      gate={gate}
      species={species}
    />
  ) : (
    <GiftPicker farm={farm} to={to} name={name} wishes={wishes} />
  );
}

/**
 * Choosing a gift for a friend, wrapping it, and leaving it on their step, or at their farm's gate
 * while visiting it (`gate`, with the friend's `name` and `species` from the gate).
 */
export function GiftScreen() {
  const shop = useShop();
  const { farm, to, item, gate, name, species } = useShopParams(
    'farm',
    'to',
    'item',
    'gate',
    'name',
    'species',
  );
  if (shop.failed || farm === '' || to === '') return <ShopFailed onRetry={shop.reload} />;
  if (shop.loading) return <ScreenLoading />;
  return (
    <GiftFor farm={farm} to={to} item={item} gate={gate === '1'} friend={name} species={species} />
  );
}
