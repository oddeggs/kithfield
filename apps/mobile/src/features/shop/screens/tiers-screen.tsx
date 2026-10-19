import { PATRON_PRODUCTS, type StoreProductId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View, type AccessibilityActionEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { useBecomePatron } from '../data/flows';
import { useShop } from '../data/shop-data';
import { useInks } from '../kit/inks';
import { Header, useDesignTop } from '../kit/layout';
import { BigPill, LegalLinks } from '../kit/patron-bits';
import { SText } from '../kit/text';

type Tier = 'patron' | 'farmPlus' | 'founding';
type Period = 'month' | 'year';

const ALL_PATRON_PRODUCTS: readonly StoreProductId[] = Object.values(PATRON_PRODUCTS);

/** The product a choice buys. */
function productOf(tier: Tier, period: Period): StoreProductId {
  if (tier === 'farmPlus') return PATRON_PRODUCTS.farmPlusMonthly;
  if (tier === 'founding') return PATRON_PRODUCTS.founding;
  return period === 'year' ? PATRON_PRODUCTS.patronYearly : PATRON_PRODUCTS.patronMonthly;
}

/**
 * The patron tiers: Patron (monthly or yearly), Farm Plus, and Founding Farmer while the launch
 * season lasts. Prices are the store's own; the renewal terms are spelled out in full above the
 * button, whose second line always names the period chosen.
 */
export function TiersScreen() {
  const { t } = useLocale();
  const inks = useInks();
  const { palette } = useTheme();
  const toast = useToast();
  const shop = useShop();
  const insets = useSafeAreaInsets();
  const at = useDesignTop();
  const { state, subscribe } = useBecomePatron();
  const [tier, setTier] = useState<Tier>('patron');
  const [period, setPeriod] = useState<Period>('month');
  const [founding, setFounding] = useState(false);
  const { loadPrices, prices, api } = shop;

  useEffect(() => {
    loadPrices(ALL_PATRON_PRODUCTS);
    let live = true;
    api.patronOffer().then(
      (offer) => live && setFounding(offer.founding),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api, loadPrices]);

  const price = (product: StoreProductId): string | null => prices[product] ?? null;
  const said = (product: StoreProductId): string =>
    price(product) ??
    t(Platform.OS === 'android' ? 'android.shop.priceUnknown' : 'shop.tiers.priceUnknown');
  const month = price(PATRON_PRODUCTS.patronMonthly);
  const year = price(PATRON_PRODUCTS.patronYearly);
  const plus = price(PATRON_PRODUCTS.farmPlusMonthly);
  const once = price(PATRON_PRODUCTS.founding);
  const product = productOf(tier, period);
  const sub =
    tier === 'founding'
      ? t('shop.tiers.ctaOnce', { price: said(product) })
      : period === 'year' && tier === 'patron'
        ? t('shop.tiers.ctaYearly', { price: said(product) })
        : t('shop.tiers.ctaMonthly', { price: said(product) });

  const buy = async () => {
    if (await subscribe(product)) {
      toast.show(t('shop.tiers.thanks'));
      router.replace('/shop/patron');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: at(112), paddingHorizontal: 20, gap: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <TierCard
          chosen={tier === 'patron'}
          onPress={() => setTier('patron')}
          name={t('shop.tiers.patron')}
          price={
            period === 'month'
              ? month && t('shop.tiers.perMonth', { price: month })
              : year && t('shop.tiers.perYear', { price: year })
          }
          body={t('shop.tiers.patronBody')}
          note={
            period === 'month'
              ? year && t('shop.tiers.orYear', { price: year })
              : month && t('shop.tiers.orMonth', { price: month })
          }
          onNote={() => {
            setTier('patron');
            setPeriod((p) => (p === 'month' ? 'year' : 'month'));
          }}
        />
        <TierCard
          chosen={tier === 'farmPlus'}
          onPress={() => setTier('farmPlus')}
          name={t('shop.tiers.farmPlus')}
          price={plus && t('shop.tiers.perMonth', { price: plus })}
          body={t('shop.tiers.farmPlusBody')}
        />
        {founding ? (
          <TierCard
            chosen={tier === 'founding'}
            onPress={() => setTier('founding')}
            name={t('shop.tiers.founding')}
            price={once && t('shop.tiers.once', { price: once })}
            body={t('shop.tiers.foundingBody')}
            note={t('shop.tiers.foundingNote')}
          />
        ) : null}
        <SText s={12.5} lh={1.45} multiline color={inks.body}>
          {t('shop.tiers.honest')}
        </SText>
      </ScrollView>
      <View
        style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom, gap: 10 }}
      >
        <View
          style={{
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: inks.disclosure.bg,
          }}
        >
          <SText s={11.5} lh={1.45} multiline color={inks.disclosure.fg}>
            <SText s={11.5} lh={1.45} w={600} color={inks.disclosure.strong}>
              {t('shop.tiers.disclosureLead')}
            </SText>
            {t(Platform.OS === 'android' ? 'android.shop.disclosure' : 'shop.tiers.disclosure', {
              month: said(PATRON_PRODUCTS.patronMonthly),
              year: said(PATRON_PRODUCTS.patronYearly),
              plus: said(PATRON_PRODUCTS.farmPlusMonthly),
            })}
            {founding ? t('shop.tiers.disclosureFounding') : ''}
          </SText>
        </View>
        <BigPill
          label={t('shop.tiers.cta')}
          sub={sub}
          busy={state === 'busy'}
          onPress={() => void buy()}
        />
        <LegalLinks />
      </View>
      <Header title={t('shop.tiers.title')} />
    </View>
  );
}

/**
 * One tier: name and price on a line, what it is, and a hand-written note under it. VoiceOver
 * reads the card as one radio; a note that switches the period is the card's own action, since an
 * element inside the card can't be reached.
 */
function TierCard({
  chosen,
  onPress,
  name,
  price,
  body,
  note,
  onNote,
}: {
  readonly chosen: boolean;
  readonly onPress: () => void;
  readonly name: string;
  readonly price: string | null;
  readonly body: string;
  readonly note?: string | null;
  readonly onNote?: () => void;
}) {
  const inks = useInks();
  const { palette } = useTheme();
  const ax = useAccessibilitySize();
  const switchNote = note && onNote ? note : null;
  const noteText = note ? (
    <SText f="hand" s={14} lh={1.2} color={inks.eyebrow.honey} style={{ marginTop: 2 }}>
      {note}
    </SText>
  ) : null;
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'activate') {
      haptics.select();
      onPress();
    }
    if (e.nativeEvent.actionName === 'switchPeriod') onNote?.();
  };
  return (
    <View
      accessible
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={[name, price, body, switchNote ? null : note].filter(Boolean).join(', ')}
      accessibilityActions={[
        { name: 'activate' },
        ...(switchNote ? [{ name: 'switchPeriod', label: switchNote }] : []),
      ]}
      onAccessibilityAction={onAction}
    >
      <Press
        onPress={onPress}
        haptic="select"
        radius={22}
        accessible={false}
        style={{
          borderRadius: 22,
          backgroundColor: chosen ? inks.chosen.bg : inks.tile,
          borderWidth: chosen ? 2 : 1,
          borderColor: chosen ? inks.chosen.border : palette.hairline,
          // The chosen card's thicker border doesn't move what's inside it.
          paddingVertical: chosen ? 11 : 12,
          paddingHorizontal: chosen ? 15 : 16,
          gap: 4,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            // At the accessibility sizes the price moves under the name rather than being cut.
            flexWrap: ax ? 'wrap' : 'nowrap',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <SText f="serif" s={20} lh={1.1} style={{ flexShrink: 1 }}>
            {name}
          </SText>
          {price ? (
            <SText
              s={15}
              w={600}
              numberOfLines={ax ? undefined : 1}
              style={ax ? { flexShrink: 1 } : undefined}
            >
              {price}
            </SText>
          ) : null}
        </View>
        <SText s={13.5} lh={1.4} multiline color={inks.paragraph}>
          {body}
        </SText>
        {noteText && onNote ? (
          <Press onPress={onNote} darken={false} accessible={false} hitSlop={8}>
            {noteText}
          </Press>
        ) : (
          noteText
        )}
      </Press>
    </View>
  );
}
