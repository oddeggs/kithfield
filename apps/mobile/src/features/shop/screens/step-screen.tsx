import {
  GatePayload,
  GiftPayload,
  type ArtId,
  type FarmId,
  type FarmState,
  type Id,
} from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useDataClient, useOpenFarm, useSend } from '../../../data/react';
import { ArtStill } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { fadeTo } from '../../../ui/motion/motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { itemName } from '../copy';
import { useWear } from '../data/flows';
import { useShop } from '../data/shop-data';
import { andList } from '../format';
import { ItemArt } from '../item-art';
import { Eyebrow, Pill, Title } from '../kit/bits';
import { useInks } from '../kit/inks';
import { HeroSheet } from '../kit/layout';
import { memberOf, useFarmState } from '../kit/members';
import { currentSeason, useShopParams } from '../kit/season';
import { ShopFailed } from '../kit/states';
import { SText } from '../kit/text';
import { isWrapId } from './gift-screen';

/** The doorstep is 470 tall; the sheet comes up over it from 440. */
const HERO = 470;
const SHEET = 440;

/** A gift waiting on the step: who it's from, its wrapping, what's in it and the tag's words. */
interface Parcel {
  readonly from: readonly string[];
  readonly wrap: ArtId;
  readonly item: ArtId;
  readonly note: string | null;
}

/** The gift's event (left by a member, or at the gate by a visitor), read from the phone's log. */
function useParcel(farm: FarmId, gift: Id, state: FarmState | null): Parcel | null | 'gone' {
  const client = useDataClient();
  const shop = useShop();
  const [parcel, setParcel] = useState<Parcel | null | 'gone'>(null);
  const waiting = state?.doorstep.find((d) => d.gift === gift && d.to === shop.person) ?? null;
  const seq = waiting?.seq ?? null;
  useEffect(() => {
    if (state === null) return;
    if (seq === null) {
      setParcel((p) => (p === null ? 'gone' : p));
      return;
    }
    let live = true;
    client.events(farm, { before: seq + 1, limit: 1 }).then(
      (rows) => {
        if (!live) return;
        const event = rows.find((e) => e.seq === seq);
        const name = (person: string | null) =>
          (person === null ? null : memberOf(state, person)?.name) ?? '';
        if (event?.kind === 'gift') {
          const p = GiftPayload.safeParse(event.payload);
          if (p.success && p.data.action === 'given') {
            setParcel({
              from: [name(event.actor), ...(p.data.with ?? []).map(name)].filter((n) => n !== ''),
              wrap: p.data.wrap,
              item: p.data.item,
              note: p.data.note ?? null,
            });
            return;
          }
        }
        if (event?.kind === 'gate') {
          const p = GatePayload.safeParse(event.payload);
          if (p.success && p.data.gesture.gesture === 'gift') {
            setParcel({
              from: [p.data.visitor.name],
              wrap: p.data.gesture.wrap,
              item: p.data.gesture.item,
              note: p.data.gesture.note ?? null,
            });
            return;
          }
        }
        setParcel('gone');
      },
      () => live && setParcel('gone'),
    );
    return () => {
      live = false;
    };
  }, [client, farm, seq, state]);
  return parcel;
}

function Step({ farm, gift }: { readonly farm: FarmId; readonly gift: Id }) {
  useOpenFarm(farm);
  const shop = useShop();
  const { t } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const state = useFarmState(farm);
  const found = useParcel(farm, gift, state);
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = useSend(farm);
  const wear = useWear();
  const reveal = useSharedValue(0);
  const shown = useAnimatedStyle(() => ({ opacity: reveal.get() }));
  // Once opened the gift leaves the step; the parcel stays drawn as it was.
  useEffect(() => {
    if (found !== null && found !== 'gone') setParcel(found);
  }, [found]);

  const me = shop.me;
  const species = me?.critter?.species ?? 'owl';
  const wrapColour = parcel && isWrapId(parcel.wrap) ? inks.wraps[parcel.wrap] : inks.wraps['clay'];
  const art = (
    <ArtStill
      scene="doorstep"
      width={width}
      height={HERO}
      attrs={{
        kind: species,
        state: 'found',
        color: wrapColour ?? '#d4704e',
        caption: t('shop.step.forYou', { name: me?.name ?? '' }),
      }}
      t={1.2}
    />
  );

  if (found === 'gone' && parcel === null) {
    return (
      <HeroSheet art={art} artHeight={HERO} sheetTop={SHEET}>
        <SText s={14.5} lh={1.45} color={palette.body} multiline>
          {t('shop.step.gone')}
        </SText>
        <Pill label={t('shop.back')} kind="soft" size={16} onPress={() => router.back()} />
      </HeroSheet>
    );
  }
  if (parcel === null)
    return (
      <HeroSheet art={art} artHeight={HERO} sheetTop={SHEET}>
        {null}
      </HeroSheet>
    );

  const wrapWord = isWrapId(parcel.wrap) ? t(`shop.wrap.${parcel.wrap}.paper`) : '';
  const title =
    parcel.from.length > 1
      ? t('shop.step.fromMany', {
          names: andList(parcel.from, (rest, last) => t('shop.and', { rest, last })),
          wrap: wrapWord,
        })
      : t('shop.step.from', { name: parcel.from[0] ?? '', wrap: wrapWord });
  const item = shop.item(parcel.item);

  const open = async () => {
    setBusy(true);
    const sent = await send('gift', { action: 'opened', gift });
    setBusy(false);
    if (sent.status !== 'queued') {
      toast.show(t('shop.failed'));
      return;
    }
    setOpened(true);
    reveal.set(fadeTo(1));
    void shop.refreshCollection();
  };

  return (
    <HeroSheet art={art} artHeight={HERO} sheetTop={SHEET}>
      <Eyebrow text={t('shop.step.eyebrow')} />
      <Title text={title} />
      {parcel.note ? (
        <SText s={14.5} lh={1.45} color={palette.body} multiline>
          {`“${parcel.note}”`}
        </SText>
      ) : null}
      {opened ? (
        <Animated.View style={[{ gap: 12 }, shown]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {item ? (
              <View style={{ width: 90, height: 90, borderRadius: 18, overflow: 'hidden' }}>
                <ItemArt
                  look={{ item: item.item, kind: item.kind, season: currentSeason(), species }}
                  width={90}
                  height={90}
                />
              </View>
            ) : null}
            <SText s={16} lh={1.3} w={600} multiline style={{ flex: 1 }}>
              {t('shop.step.opened', { item: itemName(t, parcel.item) })}
            </SText>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {item?.slot ? (
              <Pill
                label={t('shop.step.wear')}
                kind="go"
                size={16}
                flex={1.3}
                onPress={() => {
                  if (item.slot) void wear(item.slot, item.item).then((ok) => ok && router.back());
                }}
              />
            ) : null}
            <Pill
              label={t('shop.step.keep')}
              kind="soft"
              size={16}
              flex={1}
              onPress={() => router.back()}
            />
          </View>
        </Animated.View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pill
            label={t('shop.step.open')}
            kind="go"
            size={16}
            flex={1.3}
            busy={busy}
            haptic="success"
            onPress={() => void open()}
          />
          <Pill
            label={t('shop.step.later')}
            kind="soft"
            size={16}
            flex={1}
            onPress={() => router.back()}
          />
        </View>
      )}
    </HeroSheet>
  );
}

/** A gift waiting on your step: who it's from, the tag, and opening it. */
export function StepScreen() {
  const shop = useShop();
  const { farm, gift } = useShopParams('farm', 'gift');
  if (farm === '' || gift === '') return <ShopFailed onRetry={shop.reload} />;
  return <Step farm={farm} gift={gift} />;
}
