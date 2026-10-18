import type { ShopCatalog } from '@kithfield/contracts';
import { LIMITS } from '@kithfield/contracts';
import { fontFor, type } from '@kithfield/theme';
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient } from '../../../data';
import { ArtStill } from '../../../ui/art/art-view';
import { EmptyState } from '../../../ui/components/state-shell';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { stickersApi } from '../api';
import { useGiftFriends } from '../data';
import { offered, packOf } from '../model/catalogue';
import { giveGift } from '../model/gift';
import { sceneOfSticker } from '../model/look';
import { startPurchase, storePrices } from '../purchase';
import { useStickerColours } from '../ui/colours';
import { FaceRow } from '../ui/face-row';
import { leave, ScreenHeader } from '../ui/header';
import { StickerArt } from '../ui/sticker';
import { useMe } from '../ui/use-me';
import { wornName } from '../ui/worn';
import { roomy } from '../ui/type';

/** The wrappings shown when the shop's catalogue can't be read: the design's four. */
const FALLBACK_WRAPS = ['clay', 'dusk', 'fern', 'honey'];
const WRAPS_SHOWN = 4;

/**
 * Gift a pack: pick the friend, see it wearing their own critter, write a little note and pick a
 * wrapping. Paying goes through the shop's flow; the gift then waits on their doorstep.
 */
export function GiftScreen({
  pack: packId,
  farm,
  to,
}: {
  readonly pack: string;
  readonly farm: string | null;
  readonly to: string | null;
}) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  const sc = useStickerColours();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const client = useDataClient();
  const me = useMe();
  const friends = useGiftFriends(farm, me.person);
  const pack = packOf(packId);
  const [picked, setPicked] = useState<string | null>(to);
  const [note, setNote] = useState('');
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [wrap, setWrap] = useState<string | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const giftProduct = catalog?.items.find((i) => i.item === packId)?.giftProduct ?? null;
  useEffect(() => {
    if (giftProduct === null) return;
    let live = true;
    storePrices([giftProduct]).then(
      (p) => live && setPrice(p[giftProduct] ?? null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [giftProduct]);

  useEffect(() => {
    if (picked === null && friends && friends[0]) setPicked(friends[0].person);
  }, [friends, picked]);

  const wraps = (catalog?.wraps ?? FALLBACK_WRAPS).slice(0, WRAPS_SHOWN);
  const chosenWrap = wrap ?? wraps[0] ?? null;
  const friend = friends?.find((f) => f.person === picked) ?? null;

  if (pack === null || (friends !== null && friends.length === 0)) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ScreenHeader title={t('stickers.gift.title')} />
        <EmptyState
          art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'empty' }} />}
          title={t('stickers.gift.title')}
          body={t('stickers.gift.nobody')}
          action={{ label: t('stickers.back'), onPress: leave, kind: 'primary' }}
        />
      </View>
    );
  }

  const name = friend?.name ?? t('stickers.someone');
  const worn = wornName(t, friend?.critter ?? null);
  const critterWord = friend ? t(`farm.species.${friend.critter.species}`).toLocaleLowerCase() : '';
  const packName = t(`stickers.pack.${pack.id}`);
  const sender = friend ? { name: friend.name, critter: friend.critter } : null;

  const wrapUp = () => {
    if (!friend || chosenWrap === null) return;
    setBusy(true);
    const api = stickersApi(client.api);
    void giveGift(
      {
        start: (req) => api.startGift(req),
        pay: (product) => startPurchase(product),
        paid: (gift, transaction) => api.giftPaid(gift, transaction),
        give: (payload) => client.send(friend.farm, 'gift', payload),
      },
      { farm: friend.farm, to: friend.person, item: pack.id, wrap: chosenWrap, note },
    ).then((outcome) => {
      setBusy(false);
      switch (outcome.status) {
        case 'given':
          toast.show(t('stickers.gift.sent', { name }));
          leave();
          return;
        case 'already_has':
          toast.show(t('stickers.gift.alreadyHas', { name }));
          return;
        case 'store_closed':
          toast.show(t('stickers.shop.unavailable'));
          return;
        case 'cancelled':
          return;
        case 'unavailable':
        case 'failed':
          toast.show(t('stickers.shop.failed'));
      }
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title={t('stickers.gift.title')} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 53,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 100,
          gap: 14,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Txt variant="handL" color={sc.gift} style={roomy('handL')}>
            {packName.toLocaleLowerCase()}
          </Txt>
          <Txt
            variant="displayM"
            accessibilityRole="header"
            style={[roomy('displayM'), { marginTop: 2 }]}
          >
            {t('stickers.gift.to', { name })}
          </Txt>
        </View>
        {friends ? (
          <FaceRow
            faces={friends.map((f) => ({
              person: f.person,
              name: f.name ?? t('stickers.someone'),
              critter: f.critter,
            }))}
            picked={picked ? [picked] : []}
            onToggle={setPicked}
            labelOf={(f) => t('stickers.gift.pickFriend', { name: f.name })}
          />
        ) : null}
        <View
          style={{
            borderRadius: 24,
            backgroundColor: sc.pack[pack.id],
            paddingTop: 12,
            paddingHorizontal: 12,
            paddingBottom: 10,
            gap: 6,
          }}
        >
          <Txt variant="buttonSmall" multiline color={sc.noteText}>
            {worn
              ? t('stickers.gift.wearing', { name, critter: critterWord, item: worn })
              : t('stickers.gift.wearingPlain', { name, critter: critterWord })}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {offered(pack)
              .slice(0, 4)
              .map((st) => (
                <View key={st.id} style={{ flex: 1, alignItems: 'center' }}>
                  <StickerArt
                    attrs={sceneOfSticker(t, { pack: pack.id, sticker: st.id }, sender, () => null)}
                    size={78}
                  />
                </View>
              ))}
          </View>
        </View>
        <View
          style={{
            borderRadius: 22,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <Txt
            variant="label"
            color={palette.muted}
            style={{ marginBottom: 6, letterSpacing: 0.6 }}
          >
            {t('stickers.gift.note')}
          </Txt>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={LIMITS.giftNote}
            multiline
            placeholder={t('stickers.gift.notePlaceholder')}
            placeholderTextColor={palette.placeholder}
            accessibilityLabel={t('stickers.gift.note')}
            style={{ ...fontFor(type.handL, fontLocale), color: palette.text, padding: 0 }}
          />
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Txt variant="buttonSmall">{t('stickers.gift.wrapping')}</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {wraps.map((w) => {
              const on = w === chosenWrap;
              return (
                <Press
                  key={w}
                  onPress={() => setWrap(w)}
                  haptic="select"
                  darken={false}
                  accessibilityLabel={t('stickers.gift.wrapName', { wrap: w.replace(/_/g, ' ') })}
                  accessibilityState={{ selected: on }}
                  style={{
                    width: 41,
                    height: 41,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: on ? 2 : 0,
                    borderColor: sc.ring,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      backgroundColor: sc.wraps[w] ?? palette.fillSecondary,
                      borderWidth: on ? 0 : 1,
                      borderColor: palette.cardBorder,
                      overflow: 'hidden',
                    }}
                  >
                    <Stripes colour={sc.stripe} />
                  </View>
                </Press>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom }}>
        <Press
          onPress={wrapUp}
          disabled={busy || !friend}
          haptic="tap"
          radius={28}
          accessibilityLabel={
            price ? t('stickers.gift.wrap', { price }) : t('stickers.gift.wrapNoPrice')
          }
          style={{
            height: 56,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: sc.gift,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Txt variant="button" color={sc.giftFg}>
            {price ? t('stickers.gift.wrap', { price }) : t('stickers.gift.wrapNoPrice')}
          </Txt>
        </Press>
      </View>
    </View>
  );
}

/** The paper's diagonal stripes: white at 28%, 4 points wide every 9. */
function Stripes({ colour }: { readonly colour: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: -16,
        top: -16,
        width: 64,
        height: 64,
        transform: [{ rotate: '45deg' }],
      }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * 9,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: colour,
          }}
        />
      ))}
    </View>
  );
}
