import type { Critter } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ArtStill } from '../../../ui/art/art-view';
import { sceneLook } from '../../../ui/art/critter-look';
import { LayeredScene } from '../../../ui/art/layered-scene';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { itemName } from '../copy';
import { useShop } from '../data/shop-data';
import { ItemArt, itemScene, type ItemLook } from '../item-art';
import { Pill, ringStyle } from '../kit/bits';
import { KeepButton } from '../kit/keep-button';
import { useInks } from '../kit/inks';
import { Header, HeroSheet, useDesignTop } from '../kit/layout';
import { currentSeason, useShopParams } from '../kit/season';
import { ShopFailed, ShopLoading } from '../kit/states';
import { SText } from '../kit/text';

const HERO = 470;
const SHEET = 440;

/** What the critter wears, for a cottage tried on beside them. */
function outfitOf(critter: Critter | null) {
  if (!critter) return { outfit: 'scarf', color: '#5E7F4A' };
  const look = sceneLook(critter);
  return look['outfit'] ? { outfit: look['outfit'], color: look['ocolor'] ?? '#5E7F4A' } : null;
}

/** The Day / Night switch over the art: a glass track with the chosen side lit. */
function DayNight({
  night,
  onChange,
}: {
  readonly night: boolean;
  readonly onChange: (night: boolean) => void;
}) {
  const inks = useInks();
  const { t } = useLocale();
  const side = (isNight: boolean, label: string) => (
    <Press
      onPress={() => onChange(isNight)}
      haptic="select"
      radius={11}
      accessibilityRole="button"
      accessibilityState={{ selected: night === isNight }}
      accessibilityLabel={label}
      style={{
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 11,
        justifyContent: 'center',
        backgroundColor: night === isNight ? inks.glassThumb : 'transparent',
      }}
    >
      <SText s={13} w={600}>
        {label}
      </SText>
    </Press>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 3,
        borderRadius: 14,
        backgroundColor: inks.glassTrack,
      }}
    >
      {side(false, t('shop.try.day'))}
      {side(true, t('shop.try.night'))}
    </View>
  );
}

/**
 * The item on the person's own critter and farm. A cottage swaps between day and night as a held
 * frame: the night drawing fades in over two drawings on twos (instantly under Reduce Motion).
 */
function TryOnArt({
  look,
  width,
  height,
}: {
  readonly look: ItemLook;
  readonly width: number;
  readonly height: number;
}) {
  const reduce = useReduceMotion();
  const cottage = look.kind === 'cottage';
  const isNight = cottage && look.night === true;
  const current = itemScene({ ...look, night: isNight });
  // Only the drawing on show moves (a full-height scene's moving parts are big); the one it
  // replaces is held as a still on top and fades out over two drawings on twos.
  const [leaving, setLeaving] = useState<ReturnType<typeof itemScene> | null>(null);
  const was = useRef(isNight);
  const veil = useSharedValue(0);
  useEffect(() => {
    if (was.current === isNight) return;
    setLeaving(itemScene({ ...look, night: was.current }));
    was.current = isNight;
    veil.set(1);
    veil.set(reduce ? 0 : withTiming(0, { duration: motion.twos.frameMs * 2 }));
  }, [isNight, look, reduce, veil]);
  const fade = useAnimatedStyle(() => ({ opacity: veil.get() }));
  return (
    <View style={{ width, height }}>
      <LayeredScene
        key={isNight ? 'night' : 'day'}
        scene={current.scene}
        width={width}
        height={height}
        attrs={current.attrs}
        budget={40e6}
        tolerance={8}
      />
      {leaving ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: 0 }, fade]}
        >
          <ArtStill
            scene={leaving.scene}
            width={width}
            height={height}
            attrs={leaving.attrs}
            t={1.2}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function TryOnScreen() {
  const shop = useShop();
  const { t } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const top = useDesignTop();
  const { width } = useWindowDimensions();
  const params = useShopParams('item');
  const [id, setId] = useState(params.item);
  const item = shop.item(id);
  const [night, setNight] = useState(params.item === 'lighthouse');
  const kin = useMemo(
    () => (item ? (shop.catalog?.items ?? []).filter((i) => i.kind === item.kind) : []),
    [item, shop.catalog],
  );
  const { loadPrices } = shop;
  useEffect(() => {
    if (item?.product) loadPrices([item.product]);
  }, [item, loadPrices]);

  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;

  const critter = shop.me?.critter ?? null;
  const season = currentSeason();
  const cottage = item?.kind === 'cottage';
  const look: ItemLook | null = item
    ? {
        item: item.item,
        kind: item.kind,
        season,
        night: cottage && night,
        species: critter?.species ?? 'rabbit',
        outfit: cottage ? outfitOf(critter) : null,
      }
    : null;

  return (
    <HeroSheet
      art={look ? <TryOnArt look={look} width={width} height={top(HERO)} /> : null}
      artHeight={HERO}
      sheetTop={SHEET}
      header={
        <Header right={cottage ? <DayNight night={night} onChange={setNight} /> : undefined} />
      }
    >
      {!item ? (
        <ShopLoading />
      ) : (
        <>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <SText f="serif" s={24} lh={1.12} accessibilityRole="header" style={{ flexShrink: 1 }}>
              {itemName(t, item.item)}
            </SText>
            <SText f="hand" s={16} color={inks.eyebrow.moss}>
              {t('shop.try.eyebrow')}
            </SText>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -20, flexGrow: 0 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 5 }}
          >
            {kin.map((other) => {
              const on = other.item === item.item;
              const name = itemName(t, other.item);
              return (
                <Press
                  key={other.item}
                  onPress={() => setId(other.item)}
                  haptic="select"
                  radius={14}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t('shop.try.choose', { item: name })}
                  style={[
                    { width: 52, height: 52, borderRadius: 14 },
                    ringStyle(on, inks.ringGap, inks.ring, inks.tileBorder),
                  ]}
                >
                  <View style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden' }}>
                    <ItemArt
                      look={{ item: other.item, kind: other.kind, season }}
                      width={52}
                      height={52}
                    />
                  </View>
                </Press>
              );
            })}
          </ScrollView>
          <SText s={13} lh={1.45} multiline color={palette.secondary}>
            {t('shop.try.note')}
          </SText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {cottage ? (
              <Pill
                label={t('shop.try.widget')}
                kind="soft"
                onPress={() =>
                  router.push({
                    pathname: '/shop/widget',
                    params: { item: item.item },
                  })
                }
                flex={1}
              />
            ) : null}
            <KeepButton item={item} flex={1.1} />
          </View>
        </>
      )}
    </HeroSheet>
  );
}
