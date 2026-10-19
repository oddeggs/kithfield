import { GiftPayload, type StickerPayload } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useFarm, useSend, type StoredEvent } from '../../../data';
import { ArtStill } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { lookOf } from '../../../ui/art/critter-look';
import { Button } from '../../../ui/components/button';
import { EmptyState } from '../../../ui/components/state-shell';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
import { offered, OWN, packOf, type PackId } from '../model/catalogue';
import { sceneOfSticker, type StickerPerson } from '../model/look';
import { stickerRoutes } from '../routes';
import { useStickerColours } from '../ui/colours';
import { HEADER_BOTTOM, leave, ScreenHeader } from '../ui/header';
import { StickerArt } from '../ui/sticker';
import { useMe } from '../ui/use-me';
import { wornName } from '../ui/worn';
import { GiftOpening } from './gift-opening';
import { roomy } from '../ui/type';

type Given = Extract<GiftPayload, { action: 'given' }>;

/** The `gift {given}` at `seq`, from the phone's copy or paged in from the server. */
function useGiven(
  farm: string,
  seq: number,
): { event: StoredEvent; gift: Given } | null | 'missing' {
  const client = useDataClient();
  const [found, setFound] = useState<{ event: StoredEvent; gift: Given } | null | 'missing'>(null);
  useEffect(() => {
    let live = true;
    const read = async () => {
      const at = async () =>
        (await client.events(farm, { before: seq + 1, limit: 1 })).find((e) => e.seq === seq);
      let event = await at();
      if (!event) {
        await client.pageHistory(farm, seq + 1, 1);
        event = await at();
      }
      const parsed = GiftPayload.safeParse(event?.payload);
      if (!event || event.kind !== 'gift' || !parsed.success || parsed.data.action !== 'given')
        return 'missing' as const;
      return { event, gift: parsed.data };
    };
    read().then(
      (r) => live && setFound(r),
      () => live && setFound('missing'),
    );
    return () => {
      live = false;
    };
  }, [client, farm, seq]);
  return found;
}

/**
 * A gifted pack, opening on the friend's phone: the parcel unties and the stickers tumble out,
 * already wearing their critter. Opening it tells the giver "opened", never when.
 */
export function OpenedScreen({ farm, seq }: { readonly farm: string; readonly seq: number }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const sc = useStickerColours();
  const insets = useSafeAreaInsets();
  const ax = useAccessibilitySize();
  const { width } = useWindowDimensions();
  const client = useDataClient();
  const send = useSend(farm);
  const state = useFarm(farm)?.state ?? null;
  const me = useMe();
  const given = useGiven(farm, seq);
  const opened = useRef(false);

  const gift = given !== null && given !== 'missing' ? given.gift : null;
  const giverId = given !== null && given !== 'missing' ? given.event.actor : null;
  const giver =
    state?.members.find((m) => m.person === giverId) ??
    state?.former.find((m) => m.person === giverId) ??
    null;
  const mine = state?.members.find((m) => m.person === me.person) ?? null;
  const reader: StickerPerson | null = mine
    ? { name: mine.name, critter: mine.critter }
    : me.critter
      ? { name: me.name, critter: me.critter }
      : null;
  const pack = gift ? packOf(gift.item) : null;

  // Opening it is what the giver sees: once, from the person it was for.
  useEffect(() => {
    if (!gift || opened.current || gift.to !== me.person) return;
    opened.current = true;
    void (async () => {
      const recent = await client.events(farm, { limit: 500 });
      const done = recent.some((e) => {
        const p = GiftPayload.safeParse(e.payload);
        return (
          e.kind === 'gift' && p.success && p.data.action === 'opened' && p.data.gift === gift.gift
        );
      });
      if (!done) await send('gift', { action: 'opened', gift: gift.gift });
    })().catch(() => {
      // Not opened this time: it is tried again the next time the gift is opened.
      opened.current = false;
    });
  }, [gift, me.person, client, farm, send]);

  const stickers = useMemo(() => (pack ? offered(pack) : []), [pack]);

  if (given === 'missing' || (given !== null && pack === null)) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ScreenHeader />
        <EmptyState
          art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'empty' }} />}
          title={t('stickers.opened.gone')}
          body={t('stickers.opened.goneBody')}
          action={{ label: t('stickers.back'), onPress: leave, kind: 'primary' }}
        />
      </View>
    );
  }

  const worn = wornName(t, reader?.critter ?? null);
  const draw = (sticker: string, caption = true) => {
    const attrs = sceneOfSticker(t, { pack: pack?.id ?? OWN, sticker }, reader, () => null);
    return caption ? attrs : { ...attrs, caption: '-' };
  };
  const thanks = () => {
    const say: StickerPayload = {
      pack: OWN,
      sticker: 'thanks',
      replyTo: seq,
    };
    void send('sticker', say).then(() => leave());
  };

  // At the accessibility sizes the blocks the design places on the screen stack in one column
  // that scrolls, under the header.
  const at = (place: { top: number; left: number; right: number }) =>
    ax ? { marginHorizontal: place.left } : ({ position: 'absolute', ...place } as const);
  // The parcel and the two stickers tossed out of it, as one block 320 high.
  const ART_TOP = insets.top + 11;
  const blocks = (
    <>
      <View style={[at({ top: ART_TOP, left: 0, right: 0 }), { height: 320 }]}>
        <GiftOpening
          width={width}
          height={320}
          color={sc.wraps[given?.gift.wrap ?? 'clay'] ?? sc.wraps['clay'] ?? ''}
        />
        {pack && stickers[0] && stickers[1] ? (
          <>
            <View
              style={{
                position: 'absolute',
                top: 39 - 11,
                left: 22,
                transform: [{ rotate: '-10deg' }],
              }}
            >
              <StickerArt attrs={draw(stickers[0].id, false)} size={92} />
            </View>
            <View
              style={{
                position: 'absolute',
                top: 25 - 11,
                right: 22,
                transform: [{ rotate: '9deg' }],
              }}
            >
              <StickerArt attrs={draw(stickers[1].id, false)} size={92} />
            </View>
          </>
        ) : null}
      </View>
      <View
        style={{
          ...at({ top: insets.top + 339, left: 24, right: 24 }),
          gap: 8,
          alignItems: 'center',
        }}
      >
        <Txt variant="handL" color={sc.giftFrom} style={roomy('handL')}>
          {t('stickers.opened.from', { name: giver?.name ?? t('stickers.someone') })}
        </Txt>
        <Txt
          variant="displayL"
          multiline
          align="center"
          accessibilityRole="header"
          style={roomy('displayL')}
        >
          {pack ? t('stickers.opened.title', { pack: t(`stickers.pack.${pack.id}`) }) : ''}
        </Txt>
        <Txt variant="body" multiline align="center" color={palette.body}>
          {`${worn ? t('stickers.opened.wearing', { item: worn }) : t('stickers.opened.wearingOwn')} ${
            pack && pack.id !== OWN
              ? t(`stickers.pack.${pack.id as Exclude<PackId, 'mine'>}.gift`)
              : ''
          }`.trim()}
        </Txt>
      </View>
      {gift?.note ? (
        <View
          style={{
            ...at({ top: insets.top + 489, left: 20, right: 20 }),
            borderRadius: 22,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          {giver ? (
            <Avatar kind={giver.critter.species} look={lookOf(giver.critter)} size={34} />
          ) : null}
          <Txt variant="handL" multiline style={[{ flex: 1 }, roomy('handL')]}>
            {gift.note}
          </Txt>
        </View>
      ) : null}
      <View
        style={{
          ...at({ top: insets.top + 581, left: 16, right: 16 }),
          flexDirection: 'row',
          gap: 2,
        }}
      >
        {stickers.slice(2, 6).map((st) => (
          <View key={st.id} style={{ flex: 1, alignItems: 'center' }}>
            <StickerArt attrs={draw(st.id)} size={88} />
          </View>
        ))}
      </View>
    </>
  );
  const buttons = (
    <>
      <Press
        onPress={() => router.replace(stickerRoutes.picker(farm))}
        radius={28}
        accessibilityLabel={t('stickers.opened.open')}
        style={{
          ...(ax ? { paddingVertical: 12, paddingHorizontal: 20 } : { flex: 1 }),
          minHeight: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: sc.soft,
        }}
      >
        <Txt
          variant="buttonText"
          {...(ax ? { multiline: true, align: 'center' } : { numberOfLines: 1 })}
        >
          {t('stickers.opened.open')}
        </Txt>
      </Press>
      <View style={ax ? {} : { flex: 1.3 }}>
        <Button label={t('stickers.opened.thanks')} kind="primary" onPress={thanks} />
      </View>
    </>
  );
  if (ax) {
    return (
      <View style={{ flex: 1, backgroundColor: sc.openedBg }}>
        <ScreenHeader glass={false} />
        <ScrollView
          // Below the header, so nothing scrolls under its back button.
          style={{ marginTop: insets.top + HEADER_BOTTOM }}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 16,
            gap: 20,
          }}
        >
          {blocks}
          <View style={{ marginHorizontal: 24, gap: 10 }}>{buttons}</View>
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: sc.openedBg }}>
      <ScreenHeader glass={false} />
      {blocks}
      <View
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: insets.bottom,
          flexDirection: 'row',
          gap: 10,
        }}
      >
        {buttons}
      </View>
    </View>
  );
}
