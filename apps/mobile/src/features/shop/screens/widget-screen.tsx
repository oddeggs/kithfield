import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { itemName } from '../copy';
import { useShop } from '../data/shop-data';
import { lowerFirst } from '../format';
import { ItemArt } from '../item-art';
import { useInks } from '../kit/inks';
import { KeepButton } from '../kit/keep-button';
import { goBack, useDesignTop } from '../kit/layout';
import { currentSeason, useShopParams } from '../kit/season';
import { ShopFailed, ShopLoading } from '../kit/states';
import { SText } from '../kit/text';

/**
 * Tonight's home-screen widget with the item kept: the medium widget and the small one, drawn
 * at night whatever the hour, as the widget would show it after dark.
 */
export function WidgetPreviewScreen() {
  const shop = useShop();
  const { t, language } = useLocale();
  const inks = useInks();
  const w = inks.widgetPreview;
  const top = useDesignTop();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { item: id } = useShopParams('item');
  const item = shop.item(id);
  const { loadPrices } = shop;
  useEffect(() => {
    if (item?.product) loadPrices([item.product]);
  }, [item, loadPrices]);

  if (shop.failed) return <ShopFailed onRetry={shop.reload} />;

  const season = currentSeason();
  const side = 27;
  const medium = width - side * 2;
  const name = item ? itemName(t, item.item) : '';
  const label = t('shop.widget.name', {
    name: shop.me?.name ?? '',
    item: language === 'en' ? lowerFirst(name) : name,
  });
  const look = item ? { item: item.item, kind: item.kind, season, night: true } : null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: w.sky,
        experimental_backgroundImage: `radial-gradient(120% 70% at 30% 0%, ${w.glow} 0%, ${w.sky} 60%)`,
      }}
    >
      {!look || !item ? (
        <View style={{ paddingTop: top(80) }}>
          <ShopLoading />
        </View>
      ) : (
        <>
          <View
            style={{
              position: 'absolute',
              top: top(80),
              left: side,
              width: medium,
              height: 160,
              borderRadius: 24,
              overflow: 'hidden',
            }}
            accessible
            accessibilityLabel={label}
          >
            <ItemArt look={look} width={medium} height={160} />
            <SText
              f="hand"
              s={18}
              color={w.name}
              style={{ position: 'absolute', left: 14, bottom: 12 }}
            >
              {label}
            </SText>
            <View
              style={{
                position: 'absolute',
                right: 12,
                top: 12,
                height: 24,
                paddingHorizontal: 9,
                borderRadius: 12,
                justifyContent: 'center',
                backgroundColor: w.badge.bg,
              }}
            >
              <SText s={11} w={600} color={w.badge.fg}>
                {t('shop.widget.preview')}
              </SText>
            </View>
          </View>
          <View
            style={{
              position: 'absolute',
              top: top(258),
              left: side,
              width: 160,
              height: 160,
              borderRadius: 24,
              overflow: 'hidden',
            }}
            importantForAccessibility="no-hide-descendants"
          >
            <ItemArt look={look} width={160} height={160} />
          </View>
          <SText
            s={14}
            lh={1.45}
            multiline
            color={w.text}
            style={{ position: 'absolute', top: top(268), left: side + 160 + 19, right: side }}
          >
            {t('shop.widget.note')}
          </SText>
        </>
      )}
      <View
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: Math.max(30, insets.bottom),
          flexDirection: 'row',
          gap: 10,
        }}
      >
        <Press
          onPress={goBack}
          radius={27}
          accessibilityRole="button"
          accessibilityLabel={t('shop.widget.back')}
          style={{
            flex: 1,
            flexBasis: 0,
            height: 54,
            borderRadius: 27,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: w.soft.bg,
          }}
        >
          <SText s={16} w={600} color={w.soft.fg} numberOfLines={1}>
            {t('shop.widget.back')}
          </SText>
        </Press>
        {item ? <KeepButton item={item} flex={1} kind="honey" size={16} /> : null}
      </View>
    </View>
  );
}
