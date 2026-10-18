import type { BookQuote, FarmId } from '@kithfield/contracts';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../../../data';
import { ArtStill } from '../../../ui/art/art-view';
import { Toggle } from '../../../ui/components/toggle';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { formatMoney, shareOf } from '../chip/money';
import { useShop } from '../data/shop-data';
import { InfoNote, Pill, ringStyle } from '../kit/bits';
import { FarmPick } from '../kit/farm-pick';
import { useInks } from '../kit/inks';
import { Header, useDesignTop } from '../kit/layout';
import { useFarmState } from '../kit/members';
import { ScreenLoading } from '../kit/screen-loading';
import { useShopParams } from '../kit/season';
import { ShopFailed } from '../kit/states';
import { SText } from '../kit/text';

const CLOTH_IDS = ['moss', 'rose', 'ink', 'mustard'] as const;
type ClothId = (typeof CLOTH_IDS)[number];
const isClothId = (id: string): id is ClothId => (CLOTH_IDS as readonly string[]).includes(id);

function Book({ farm }: { readonly farm: FarmId }) {
  const shop = useShop();
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const at = useDesignTop();
  const { width } = useWindowDimensions();
  const state = useFarmState(farm);
  const year = new Date().getFullYear();
  const [quote, setQuote] = useState<BookQuote | null>(null);
  const [failed, setFailed] = useState(false);
  const [cloth, setCloth] = useState<ClothId>('moss');
  const [split, setSplit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [soon, setSoon] = useState(false);
  const { api } = shop;
  useEffect(() => {
    let live = true;
    api.book(farm, year).then(
      (q) => live && setQuote(q),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, farm, year]);

  if (failed) return <ShopFailed onRetry={shop.reload} />;
  if (!quote) return <ScreenLoading />;

  const farmName = state?.name ?? '';
  const ways = Math.max(1, state?.members.length ?? 1);
  const cloths = quote.cloths.filter(isClothId);
  const colour = inks.cloth[cloth] ?? inks.cloth['moss'] ?? inks.fillMoss;
  const price = split
    ? t('shop.book.orderEach', { price: formatMoney(language, shareOf(quote.price, ways)) })
    : t('shop.book.order', { price: formatMoney(language, quote.price) });

  const order = async () => {
    setBusy(true);
    try {
      const checkout = await shop.api.orderBook(farm, { year, cloth, split });
      await WebBrowser.openBrowserAsync(checkout.url);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unavailable') setSoon(true);
      else toast.show(t('shop.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: at(96), paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <ArtStill
          scene="book"
          width={width}
          height={250}
          attrs={{ color: colour, name: farmName }}
        />
        <View style={{ marginTop: 4, paddingHorizontal: 22, gap: 4 }}>
          <SText f="serif" s={26} lh={1.1} accessibilityRole="header" multiline>
            {t('shop.book.heading', { farm: farmName, year: String(year) })}
          </SText>
          <SText s={14.5} lh={1.42} color={palette.body} multiline>
            {t('shop.book.body')}
          </SText>
        </View>
        <ArtStill
          scene="book"
          width={width - 32}
          height={150}
          attrs={{ state: 'open', color: colour, name: 'poppy' }}
          style={{ marginTop: 22, marginLeft: 16 }}
        />
        <View
          style={{
            marginTop: 8,
            marginHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <SText s={14} w={600}>
            {t('shop.book.cloth')}
          </SText>
          <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup">
            {cloths.map((id) => (
              <Press
                key={id}
                onPress={() => setCloth(id)}
                haptic="select"
                radius={9}
                darken={false}
                accessibilityRole="radio"
                accessibilityState={{ selected: id === cloth }}
                accessibilityLabel={t(`shop.book.cloth.${id}`)}
                style={[
                  { width: 32, height: 32, borderRadius: 9, backgroundColor: inks.cloth[id] },
                  ringStyle(id === cloth, palette.background, inks.ring, inks.tileBorder),
                ]}
              />
            ))}
          </View>
        </View>
        <View
          style={{
            marginTop: 14,
            marginHorizontal: 16,
            borderRadius: 18,
            backgroundColor: inks.tile,
            borderWidth: 1,
            borderColor: inks.rowRule,
            overflow: 'hidden',
          }}
        >
          <View style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
            <SText s={14.5}>
              {t('shop.book.facts', {
                hangouts: t('shop.book.hangouts', { count: quote.hangouts }),
                pages: String(quote.pages),
                size: String(quote.sizeCm),
              })}
            </SText>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              paddingTop: 8,
              paddingBottom: 10,
              paddingHorizontal: 14,
              borderTopWidth: 1,
              borderTopColor: inks.rowRule,
            }}
          >
            <View style={{ flex: 1 }}>
              <SText s={14.5} lh={1.2} w={600}>
                {t('shop.book.split')}
              </SText>
              <SText s={12.5} lh={1.3} color={palette.secondary} multiline>
                {split
                  ? t('shop.book.splitOn', { count: ways, farm: farmName })
                  : t('shop.book.splitOff')}
              </SText>
            </View>
            <Toggle value={split} onChange={setSplit} label={t('shop.book.split')} />
          </View>
        </View>
        {soon ? (
          <InfoNote text={t('shop.book.soon')} style={{ marginTop: 14, marginHorizontal: 16 }} />
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 12 }}>
        <Pill
          label={price}
          kind="ink"
          size={17}
          busy={busy}
          disabled={soon}
          onPress={() => void order()}
          style={{ height: 56, borderRadius: 28 }}
        />
      </View>
      <Header title={t('shop.book.title')} />
    </View>
  );
}

/** Printing the farm's year as a cloth-bound book, chipped in for together or not. */
export function BookScreen() {
  const shop = useShop();
  const { farm } = useShopParams('farm');
  const choose = useCallback((picked: FarmId) => router.setParams({ farm: picked }), []);
  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;
  if (farm === '') return <FarmPick onPick={choose} />;
  return <Book farm={farm} />;
}
