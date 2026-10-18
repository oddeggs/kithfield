import type { ShopCatalog } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../../data';
import { ArtIcon } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { stickersApi } from '../api';
import { useCollection } from '../data';
import { offered, packProduct, shopPacks, type PackDef, type PackId } from '../model/catalogue';
import { sceneOfSticker, type StickerPerson } from '../model/look';
import { ownsPack } from '../model/owned';
import { onPurchasesChange, startPurchase, storePrices } from '../purchase';
import { stickerRoutes } from '../routes';
import { useStickerColours } from '../ui/colours';
import { ScreenHeader } from '../ui/header';
import { StickerArt } from '../ui/sticker';
import { rowVisible, type Viewport } from '../ui/sticker-grid';
import { useMe } from '../ui/use-me';
import { roomy } from '../ui/type';

/** The packs the shop sells, in its order. */
const PACKS = shopPacks();

/** Each pack shows four stickers; the first two loop while the card is on screen. */
const PREVIEWS = 4;
const LOOPING = 2;

/**
 * The sticker shop: themed packs that wear your outfit too, owned forever. Your own pack is free
 * and isn't sold. Prices are the App Store's own; a pack can be given as a gift.
 */
export function ShopScreen({ farm }: { readonly farm: string | null }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const sc = useStickerColours();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  const me = useMe();
  const { collection, reload } = useCollection();
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [prices, setPrices] = useState<Readonly<Record<string, string>> | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [cardTops, setCardTops] = useState<Record<string, { y: number; h: number }>>({});
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    stickersApi(client.api)
      .catalog()
      .then(
        (c) => live && setCatalog(c),
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [client]);

  const packs = PACKS;
  useEffect(() => {
    let live = true;
    const load = () => {
      const products = packs.flatMap((p) => {
        const item = catalog?.items.find((i) => i.item === p.id);
        return [
          item?.product ?? packProduct(p.id),
          ...(item?.giftProduct ? [item.giftProduct] : []),
        ];
      });
      storePrices(products).then(
        (found) => live && setPrices(found),
        () => live && setPrices({}),
      );
    };
    load();
    const off = onPurchasesChange(load);
    return () => {
      live = false;
      off();
    };
  }, [catalog, packs]);

  const sender: StickerPerson | null = me.critter ? { name: me.name, critter: me.critter } : null;
  const unpriced = prices !== null && Object.keys(prices).length === 0;

  const buy = (pack: PackDef) => {
    const product = catalog?.items.find((i) => i.item === pack.id)?.product ?? packProduct(pack.id);
    setBuying(pack.id);
    void startPurchase(product).then((result) => {
      setBuying(null);
      if (result.status === 'purchased') {
        reload();
        toast.show(t('stickers.shop.bought', { pack: t(`stickers.pack.${pack.id}`) }));
      } else if (result.status === 'failed') toast.show(t('stickers.shop.failed'));
      else if (result.status === 'unavailable') toast.show(t('stickers.shop.unavailable'));
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 49, paddingBottom: insets.bottom + 24 }}
        scrollEventThrottle={100}
        onLayout={(e) => {
          const height = e.nativeEvent.layout.height;
          setViewport((v) => ({ top: 0, scrollY: v?.scrollY ?? 0, height }));
        }}
        onScroll={(e) => {
          const scrollY = e.nativeEvent.contentOffset.y;
          setViewport((v) => ({ top: 0, height: v?.height ?? 0, scrollY }));
        }}
      >
        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <Txt variant="displayL" accessibilityRole="header" style={roomy('displayL')}>
            {t('stickers.shop.title')}
          </Txt>
          <Txt variant="body" multiline color={palette.body}>
            {t('stickers.shop.lead')}
          </Txt>
          {unpriced ? (
            <Txt variant="caption" color={palette.muted}>
              {t('stickers.shop.pricesUnavailable')}
            </Txt>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: 14, gap: 8, marginTop: 10 }}>
          {packs.map((pack) => {
            const item = catalog?.items.find((i) => i.item === pack.id) ?? null;
            const owned = ownsPack(collection, pack.id);
            const product = item?.product ?? packProduct(pack.id);
            const price = prices?.[product] ?? null;
            const placed = cardTops[pack.id];
            const onScreen = placed ? rowVisible(viewport, placed.y, placed.h) : true;
            const name = t(`stickers.pack.${pack.id}`);
            return (
              <View
                key={pack.id}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  const top = y + insets.top + 49;
                  setCardTops((c) => ({ ...c, [pack.id]: { y: top, h: height } }));
                }}
                style={{
                  borderRadius: 24,
                  backgroundColor: sc.pack[pack.id],
                  paddingTop: 10,
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {offered(pack)
                    .slice(0, PREVIEWS)
                    .map((st, i) => (
                      <View key={st.id} style={{ flex: 1, aspectRatio: 1 }}>
                        <PackSticker
                          attrs={sceneOfSticker(
                            t,
                            { pack: pack.id, sticker: st.id },
                            sender,
                            () => null,
                          )}
                          still={!onScreen || i >= LOOPING}
                        />
                      </View>
                    ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt variant="rowTitle">{name}</Txt>
                      {item?.patrons ? (
                        <View
                          style={{
                            borderRadius: 8,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            backgroundColor: sc.giftButton,
                          }}
                        >
                          <Txt variant="bubbleState" color={palette.muted}>
                            {t('stickers.shop.withPlus')}
                          </Txt>
                        </View>
                      ) : null}
                    </View>
                    <Txt variant="caption" multiline color={palette.body}>
                      {t(`stickers.pack.${pack.id as Exclude<PackId, 'mine'>}.sub`)}
                    </Txt>
                  </View>
                  {item?.giftProduct !== null ? (
                    <Press
                      onPress={() => router.push(stickerRoutes.gift(pack.id, farm ?? undefined))}
                      radius={16}
                      accessibilityLabel={t('stickers.shop.gift', { pack: name })}
                      style={{
                        width: 36,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: sc.giftButton,
                      }}
                    >
                      <ArtIcon name="envelope" size={22} color={palette.text} />
                    </Press>
                  ) : null}
                  {owned ? (
                    <View
                      style={{
                        height: 32,
                        paddingHorizontal: 13,
                        borderRadius: 16,
                        justifyContent: 'center',
                        backgroundColor: sc.giftButton,
                      }}
                    >
                      <Txt variant="buttonSmall">{t('stickers.shop.owned')}</Txt>
                    </View>
                  ) : (
                    <Press
                      onPress={() => buy(pack)}
                      disabled={buying !== null}
                      radius={16}
                      accessibilityLabel={t('stickers.shop.buy', { pack: name })}
                      {...(price ? { accessibilityValue: { text: price } } : {})}
                      style={{
                        height: 32,
                        paddingHorizontal: 13,
                        borderRadius: 16,
                        justifyContent: 'center',
                        backgroundColor: palette.primary.bg,
                      }}
                    >
                      <Txt variant="buttonSmall" color={palette.primary.fg}>
                        {price ?? t('stickers.shop.get')}
                      </Txt>
                    </Press>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** A pack's preview sticker, filling its cell. */
function PackSticker({
  attrs,
  still,
}: {
  readonly attrs: Record<string, string>;
  readonly still: boolean;
}) {
  const [size, setSize] = useState(0);
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setSize(Math.floor(e.nativeEvent.layout.width))}>
      {size > 0 ? <StickerArt attrs={attrs} size={size} still={still} /> : null}
    </View>
  );
}
