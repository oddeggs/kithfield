import type { ChipIn, FarmId, FarmThemes, StoreProductId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motion, shopMotion } from '@kithfield/theme';

import { useOpenFarm, useSend } from '../../../data/react';
import { ArtStill } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { fadeTo } from '../../../ui/motion/motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { People } from '../chip/people';
import { TierPicker } from '../chip/tier-picker';
import { useChipIns } from '../chip/use-chip-ins';
import { itemBlurb, itemName } from '../copy';
import { usePledge } from '../data/flows';
import { useShop } from '../data/shop-data';
import { THEME_SEASON } from '../item-art';
import { Eyebrow, InfoNote, Pill, Progress, ringStyle, Title } from '../kit/bits';
import { FarmPick } from '../kit/farm-pick';
import { useInks } from '../kit/inks';
import { Header, HeroSheet } from '../kit/layout';
import { isKeeper, useFarmState } from '../kit/members';
import { ScreenLoading } from '../kit/screen-loading';
import { currentSeason, useShopParams } from '../kit/season';
import { ShopFailed } from '../kit/states';
import { SText } from '../kit/text';

/** The farm is 400 tall; the sheet comes up over it from 360. */
const HERO = 400;
const SHEET = 360;
/** A theme change cross-fades the farm (the design's notes). */
const THEME_FADE_MS = shopMotion.themeFadeMs;

const THEME_IDS = ['seaside_cove', 'cherry_valley', 'snowy_hollow', 'mountain_lake'] as const;

/** The farm in a theme's season, cross-fading from the last one shown on the UI thread. */
function FarmInTheme({ theme, width }: { readonly theme: string; readonly width: number }) {
  const reduce = useReduceMotion();
  const season = THEME_SEASON[theme] ?? currentSeason();
  const [under, setUnder] = useState(season);
  const [over, setOver] = useState(season);
  const fade = useSharedValue(1);
  useEffect(() => {
    if (season === over) return;
    setUnder(over);
    setOver(season);
    fade.set(0);
    fade.set(
      reduce
        ? fadeTo(1)
        : withTiming(1, {
            duration: THEME_FADE_MS,
            easing: Easing.bezier(...motion.fade.bezier),
          }),
    );
  }, [fade, over, reduce, season]);
  const top = useAnimatedStyle(() => ({ opacity: fade.get() }));
  return (
    <View style={{ width, height: HERO }}>
      <ArtStill scene="farm" width={width} height={HERO} attrs={{ season: under }} t={1.2} />
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, top]}>
        <ArtStill scene="farm" width={width} height={HERO} attrs={{ season: over }} t={1.2} />
      </Animated.View>
    </View>
  );
}

function ThemeThumb({
  theme,
  on,
  onPress,
}: {
  readonly theme: string;
  readonly on: boolean;
  readonly onPress: () => void;
}) {
  const { t } = useLocale();
  const inks = useInks();
  const name = itemName(t, theme);
  return (
    <Press
      onPress={onPress}
      haptic="select"
      darken={false}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={name}
      style={{ flex: 1, alignItems: 'center', gap: 4 }}
    >
      <View
        style={[
          { width: 76, height: 56, borderRadius: 12, overflow: 'hidden' },
          on ? ringStyle(true, inks.ringGap, inks.ring, inks.tileBorder) : null,
        ]}
      >
        <ArtStill
          scene="strip"
          width={76}
          height={56}
          attrs={{ season: THEME_SEASON[theme] ?? 'spring' }}
          t={1.2}
        />
      </View>
      <SText s={11} lh={1.2} w={600} align="center" numberOfLines={1}>
        {name}
      </SText>
    </Press>
  );
}

function ThemeSheet({ farm, initial }: { readonly farm: FarmId; readonly initial: string }) {
  useOpenFarm(farm);
  const shop = useShop();
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const state = useFarmState(farm);
  const send = useSend(farm);
  const pledge = usePledge();
  const [theme, setTheme] = useState<string>(
    (THEME_IDS as readonly string[]).includes(initial) ? initial : 'snowy_hollow',
  );
  const [owned, setOwned] = useState<FarmThemes | null>(null);
  const [picking, setPicking] = useState(false);
  const { chipIns, tiers, put } = useChipIns(farm);
  const { api, loadPrices } = shop;
  useEffect(() => {
    let live = true;
    api.themes(farm).then(
      (o) => live && setOwned(o),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api, farm]);
  useEffect(() => {
    loadPrices(tiers);
  }, [loadPrices, tiers]);

  const chipIn =
    chipIns?.find(
      (c) => c.what.for === 'theme' && c.what.theme === theme && c.state !== 'closed',
    ) ?? null;
  const lowest = tiers[0];
  const from = lowest === undefined ? undefined : shop.prices[lowest];
  const ownsIt = owned?.owned.includes(theme) === true;
  const showing = (state?.theme ?? owned?.current ?? null) === theme;
  const keeper = isKeeper(state, shop.person);

  const pick = useCallback(
    async (tier: StoreProductId) => {
      let current: ChipIn | null = chipIn;
      if (current === null) {
        try {
          current = await shop.api.startChipIn(farm, { for: 'theme', theme });
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
    [chipIn, farm, pledge, put, shop.api, t, theme, toast],
  );

  const pay = async () => {
    if (!chipIn?.mine) return;
    const next = await pledge.pay(chipIn.chipIn, chipIn.mine.tier);
    if (next) {
      put(next);
      toast.show(t('shop.chip.paid'));
    }
  };

  const showOnFarm = async () => {
    const sent = await send('settings_changed', { setting: 'theme', theme });
    if (sent.status !== 'queued') toast.show(t('shop.failed'));
  };

  const action = (() => {
    if (state?.kind === 'visit') return <InfoNote text={t('shop.theme.noFarm')} />;
    if (ownsIt) {
      return (
        <View style={{ gap: 10 }}>
          <InfoNote text={t('shop.theme.owned')} icon="check" />
          {keeper ? (
            <Pill
              label={showing ? t('shop.theme.showing') : t('shop.theme.show')}
              kind="go"
              size={16}
              disabled={showing}
              onPress={() => void showOnFarm()}
            />
          ) : (
            <SText s={12.5} lh={1.45} color={palette.secondary}>
              {t('shop.theme.keepersShow')}
            </SText>
          )}
        </View>
      );
    }
    if (chipIn?.state === 'covered' && chipIn.mine?.state === 'promised') {
      const price = shop.prices[chipIn.mine.tier];
      return (
        <Pill
          label={price ? t('shop.chip.pay', { price }) : t('shop.chip.payFree')}
          kind="go"
          size={16}
          busy={pledge.state === 'busy'}
          onPress={() => void pay()}
        />
      );
    }
    if (chipIn?.mine) {
      return (
        <InfoNote
          text={chipIn.mine.state === 'paid' ? t('shop.chip.paid') : t('shop.chip.pledged')}
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
          onPick={(tier) => void pick(tier)}
        />
      );
    }
    return (
      <Pill
        label={from ? t('shop.theme.chipIn', { price: from }) : t('shop.theme.chipInFree')}
        kind="go"
        size={16}
        onPress={() => setPicking(true)}
      />
    );
  })();

  return (
    <HeroSheet
      artHeight={HERO}
      sheetTop={SHEET}
      art={<FarmInTheme theme={theme} width={width} />}
      header={<Header />}
    >
      <Eyebrow text={t('shop.theme.eyebrow')} />
      <Title text={itemName(t, theme)} />
      <SText s={14.5} lh={1.45} color={palette.body} multiline>
        {`${itemBlurb(t, theme)} ${t('shop.theme.how')}`}
      </SText>
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
        {THEME_IDS.map((id) => (
          <ThemeThumb
            key={id}
            theme={id}
            on={id === theme}
            onPress={() => {
              setTheme(id);
              setPicking(false);
            }}
          />
        ))}
      </View>
      {chipIn && !ownsIt ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <People state={state} people={chipIn.people} />
          <View style={{ flex: 1 }}>
            <Progress value={chipIn.filled} height={8} label={itemName(t, theme)} />
          </View>
        </View>
      ) : null}
      {action}
    </HeroSheet>
  );
}

/** Farm themes the whole farm chips in for: pick one, see how full it is, chip in. */
export function ThemeScreen() {
  const shop = useShop();
  const { farm, theme } = useShopParams('farm', 'theme');
  const choose = useCallback(
    (picked: FarmId) => router.setParams({ farm: picked, theme }),
    [theme],
  );
  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;
  if (shop.loading) return <ScreenLoading />;
  if (farm === '') return <FarmPick onPick={choose} />;
  return <ThemeSheet farm={farm} initial={theme} />;
}
