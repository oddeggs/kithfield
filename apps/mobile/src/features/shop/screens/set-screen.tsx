import type { ShopItem } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { haptics } from '../../../ui/motion/haptics';
import { useLocale } from '../../../ui/locale/locale-provider';
import { fadeTo, sheetTo } from '../../../ui/motion/motion';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useToast } from '../../../ui/components/toast';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { itemName, setName, setPose } from '../copy';
import { useKeepItem, useWear } from '../data/flows';
import { useShop } from '../data/shop-data';
import { lowerFirst, onCartNow } from '../format';
import { Eyebrow, Pill, Tag, Title } from '../kit/bits';
import { useInks } from '../kit/inks';
import { Header, HeroSheet, useDesignTop } from '../kit/layout';
import { currentSeason, useShopParams } from '../kit/season';
import { RewardSticker, setCritter } from '../kit/set-parts';
import { ShopFailed, ShopLoading } from '../kit/states';
import { SText } from '../kit/text';
import { progressOf } from '../sets';

const HERO = 330;
const SHEET = 300;

/** Finished sets already celebrated while the app has been open: the pop plays once each. */
const celebrated = new Set<string>();

/** One piece of the set: a tick when it's yours, else an empty ring; then its tag. */
function PieceRow({ item, owned }: { readonly item: ShopItem; readonly owned: boolean }) {
  const shop = useShop();
  const { t } = useLocale();
  const inks = useInks();
  const ax = useAccessibilitySize();
  const name = itemName(t, item.item);
  const price = item.product === null ? null : shop.priceText(item.product);
  const tag = owned ? (
    <Tag text={t('shop.yours')} kind="owned" />
  ) : item.product === null ? (
    <Tag text={t('shop.patronsBadge')} kind="patrons" />
  ) : price ? (
    <Tag text={price} />
  ) : null;
  return (
    <View
      accessible
      accessibilityLabel={owned ? `${name}, ${t('shop.yours')}` : name}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 7,
        borderBottomWidth: 1,
        borderBottomColor: inks.rowRule,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          ...(owned
            ? { backgroundColor: inks.fillMoss }
            : { borderWidth: 1.5, borderColor: inks.checkRing }),
        }}
      >
        {owned ? <ArtIcon name="check" size={13} color={inks.onColour} /> : null}
      </View>
      <SText s={15} lh={1.2} w={600} style={{ flex: 1 }} numberOfLines={ax ? undefined : 1}>
        {name}
      </SText>
      {tag}
    </View>
  );
}

/** The set finished: a sparkle pops once (the sheet spring), then the line stays. */
function Finished({ set }: { readonly set: string }) {
  const { t } = useLocale();
  const inks = useInks();
  const reduce = useReduceMotion();
  const first = !celebrated.has(set);
  const scale = useSharedValue(first && !reduce ? 0.4 : 1);
  const shown = useSharedValue(first ? 0 : 1);
  useEffect(() => {
    if (!first) return;
    celebrated.add(set);
    haptics.success();
    shown.set(fadeTo(1));
    if (!reduce) scale.set(sheetTo(1, false));
  }, [first, reduce, scale, set, shown]);
  const pop = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: scale.get() }],
  }));
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' }}
      accessibilityLiveRegion="polite"
    >
      <Animated.View style={pop}>
        <ArtIcon name="sparkle" size={26} color={inks.sparkle} />
      </Animated.View>
      <SText s={15} lh={1.3} w={600} color={inks.link} multiline style={{ flexShrink: 1 }}>
        {t('shop.set.done', { pose: setPose(t, set) })}
      </SText>
    </View>
  );
}

/** The button for the first piece still to find: keep it (free for patrons) or buy it. */
function AddButton({ item }: { readonly item: ShopItem }) {
  const shop = useShop();
  const { t, language } = useLocale();
  const toast = useToast();
  const { state, keep } = useKeepItem();
  const wear = useWear();
  const raw = itemName(t, item.item);
  const name = language === 'en' ? lowerFirst(raw) : raw;
  const perks = shop.entitlements?.perks === true && item.slot !== null;
  const keepIt = async () => {
    if (await keep(item.item, item.product)) {
      toast.show(t('shop.try.kept'));
      if (item.slot !== null) await wear(item.slot, item.item);
    }
  };
  if (perks) {
    return (
      <Pill
        label={t('shop.set.addFree', { item: name })}
        onPress={() => void keepIt()}
        busy={state === 'busy'}
        size={16}
      />
    );
  }
  if (item.product === null) {
    return (
      <Pill
        label={t('shop.try.forPatrons')}
        kind="honey"
        onPress={() => router.push('/shop/patrons')}
        size={16}
      />
    );
  }
  if (!onCartNow(item, shop.cart?.items ?? [])) {
    const season = item.back?.season ?? currentSeason();
    return (
      <Pill
        label={t('shop.try.backIn', { season: t(`shop.season.${season}`) })}
        disabled
        onPress={() => undefined}
        size={16}
      />
    );
  }
  const price = shop.priceText(item.product);
  return (
    <Pill
      label={t('shop.set.add', { item: name, price })}
      disabled={!shop.store.available}
      onPress={() => void keepIt()}
      busy={state === 'busy'}
      size={16}
    />
  );
}

export function SetScreen() {
  const shop = useShop();
  const { t } = useLocale();
  const inks = useInks();
  const top = useDesignTop();
  const { width } = useWindowDimensions();
  const { set: id } = useShopParams('set');
  const set = shop.catalog?.sets.find((s) => s.set === id) ?? null;
  const owned = useMemo(() => new Set(shop.entitlements?.owned ?? []), [shop.entitlements]);
  const pieces = useMemo(
    () => (set ? set.items.flatMap((i) => shop.item(i) ?? []) : []),
    [set, shop],
  );
  const { loadPrices } = shop;
  useEffect(() => {
    loadPrices(pieces.flatMap((p) => (p.product === null ? [] : [p.product])));
  }, [loadPrices, pieces]);

  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;

  const season = currentSeason();
  const progress = set ? progressOf(set, owned) : null;
  const next = progress?.missing[0];
  const nextItem = next === undefined ? null : shop.item(next);
  const cottage = pieces.find((p) => p.kind === 'cottage');
  const heroAttrs: Record<string, string> = {
    name: cottage?.item ?? 'houseboat',
    kind: setCritter(id),
    season: cottage?.item === 'igloo' ? 'winter' : season,
  };

  return (
    <HeroSheet
      art={<ArtStill scene="style" width={width} height={top(HERO)} attrs={heroAttrs} t={1.2} />}
      artHeight={HERO}
      sheetTop={SHEET}
      header={<Header />}
    >
      {!set ? (
        <ShopLoading />
      ) : (
        <>
          <Eyebrow text={t('shop.set.eyebrow')} />
          <Title text={t('shop.set.title', { set: setName(t, set.set) })} />
          <View>
            {pieces.map((piece) => (
              <PieceRow key={piece.item} item={piece} owned={owned.has(piece.item)} />
            ))}
          </View>
          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 18,
              backgroundColor: inks.reward.bg,
            }}
          >
            <RewardSticker set={set} size={66} />
            <View style={{ flex: 1, gap: 2 }}>
              <SText s={15} lh={1.2} w={600} multiline>
                {t('shop.set.rewardTitle')}
              </SText>
              <SText s={13} lh={1.4} multiline color={inks.reward.fg}>
                {t('shop.set.rewardBody', { pose: setPose(t, set.set) })}
              </SText>
            </View>
          </View>
          {progress && progress.missing.length === 0 ? (
            <Finished set={id} />
          ) : nextItem ? (
            <AddButton item={nextItem} />
          ) : null}
        </>
      )}
    </HeroSheet>
  );
}
