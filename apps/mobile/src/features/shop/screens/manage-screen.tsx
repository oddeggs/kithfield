import { router } from 'expo-router';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useBecomePatron, useRestore } from '../data/flows';
import { useShop } from '../data/shop-data';
import { dayMonthYear } from '../format';
import { InfoNote } from '../kit/bits';
import { useInks } from '../kit/inks';
import { ShopFailed } from '../kit/states';
import { ScreenLoading } from '../kit/screen-loading';
import { Header, useDesignTop } from '../kit/layout';
import { BigPill, CapsLabel, GroupCard, GroupRow, Tick } from '../kit/patron-bits';
import { SText } from '../kit/text';
import { planLine, switchesOf } from '../patron-plan';

/**
 * Managing a patronage: the plan, when it renews, switching within the subscription group, what
 * happens if you stop, and the App Store's own cancel sheet. Nothing here cancels by itself.
 */
export function ManageScreen() {
  const { t, language } = useLocale();
  const inks = useInks();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const at = useDesignTop();
  const shop = useShop();
  const restore = useRestore();
  const { state, subscribe } = useBecomePatron();
  const p = shop.entitlements?.patronage ?? null;
  const date = p?.until != null ? dayMonthYear(language, p.until) : null;
  const own = p !== null && p.via === 'own';
  const lifetime = p?.tier === 'founding';

  const plan =
    p === null
      ? null
      : p.via === 'farm_plus'
        ? t('shop.member.planCovered')
        : p.period === 'month' || p.period === 'year'
          ? t('shop.manage.planValue', {
              tier: t(`shop.tier.${p.tier}`),
              period: t(`shop.period.${p.period}`),
            })
          : planLine(t, language, p);

  const switchTo = async (product: Parameters<typeof subscribe>[0]) => {
    if (await subscribe(product)) router.back();
  };

  // Nothing about your patronage is guessed: a quiet line while it comes, Try again if it can't.
  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;
  if (shop.loading || shop.entitlements === null) return <ScreenLoading />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: at(116),
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {plan !== null ? (
          <GroupCard>
            <GroupRow label={t('shop.manage.plan')} value={plan} />
            {date !== null && !lifetime ? (
              <GroupRow
                label={t(p?.state === 'ending' ? 'shop.manage.ends' : 'shop.manage.renews')}
                value={date}
              />
            ) : null}
            {p !== null && p.state !== 'lapsed'
              ? switchesOf(p).map((s) => (
                  <GroupRow
                    key={s.label}
                    label={t(`shop.manage.${s.label}`)}
                    onPress={() => {
                      if (state !== 'busy') void switchTo(s.product);
                    }}
                  />
                ))
              : null}
          </GroupCard>
        ) : null}
        {p?.state === 'grace' ? (
          <InfoNote
            text={t(Platform.OS === 'android' ? 'android.shop.grace' : 'shop.manage.grace')}
            tone="honey"
          />
        ) : null}
        {lifetime ? (
          <SText s={14.5} lh={1.45} multiline color={inks.paragraph}>
            {t('shop.manage.lifetime')}
          </SText>
        ) : own ? (
          <>
            <CapsLabel text={t('shop.manage.ifStop')} />
            {date !== null ? <Tick text={t('shop.manage.stayOn', { date })} /> : null}
            <Tick text={t('shop.manage.kept')} />
            <Tick text={t('shop.manage.wall')} />
            <Tick text={t('shop.manage.friends')} />
            <BigPill
              label={t(Platform.OS === 'android' ? 'android.shop.cancel' : 'shop.manage.cancel')}
              tone="danger"
              onPress={() => void shop.store.manage()}
            />
          </>
        ) : null}
        <Press
          onPress={() => void restore()}
          darken={false}
          accessibilityRole="button"
          accessibilityLabel={t('shop.legal.restore')}
          hitSlop={10}
          style={{ alignSelf: 'center' }}
        >
          <SText s={14} w={600} color={inks.body} align="center">
            {t('shop.legal.restore')}
          </SText>
        </Press>
      </ScrollView>
      <Header title={t('shop.manage.title')} />
    </View>
  );
}
