import type { Crop, FarmGate, FarmId, PersonId } from '@kithfield/contracts';
import { fruitColour, rhythmColours } from '@kithfield/theme';
import { getRandomBytes } from 'expo-crypto';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, useFarm } from '../../data';
import { createOpIdMaker } from '../../data/op-id';
import { ArtStill } from '../../ui/art/art-view';
import { ErrorState } from '../../ui/components/state-shell';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { Txt } from '../../ui/type/text';
import { say } from '../farm/farm-copy';
import { NightVeil, Panel } from '../farm/panel';
import { backToFarm } from '../farm/routes';
import { typeAt } from '../farm/type-at';
import { ActionButton } from './chrome';
import { handText } from './copy';
import { useLoad, useRhythmApi } from './rhythm-api';
import { fruitWords } from './visit-screen';
import { ANDROID_BACK, AndroidBackArrow } from '../android/back-arrow';

const W = 393;
const newOpId = createOpIdMaker(getRandomBytes);

/** What a refused trade says. */
const refusal = (reason: string) =>
  reason === 'limit_reached'
    ? 'rhythm.trade.limit'
    : reason === 'not_found'
      ? 'rhythm.trade.notReady'
      : reason === 'unavailable'
        ? 'rhythm.trade.unavailable'
        : 'rhythm.trade.failed';

/** A crop's card: its drawing at harvest, what it is and how much goes. */
function CropCard({
  crop,
  title,
  line,
  ring,
  onPress,
  hint,
}: {
  readonly crop: string | null;
  readonly title: string;
  readonly line: string;
  readonly ring?: string;
  readonly onPress?: () => void;
  readonly hint?: string;
}) {
  const { palette, appearance } = useTheme();
  const { fontLocale } = useLocale();
  const ax = useAccessibilitySize();
  const colours = rhythmColours[appearance];
  const body = (
    <>
      <ArtStill
        scene="plant"
        width={86}
        height={86}
        attrs={
          crop
            ? { name: crop, stage: 4, color: colours.cropCard }
            : { name: 'clover', stage: 0, color: colours.cropCard }
        }
      />
      <Txt variant="buttonSmall" align="center" numberOfLines={ax ? undefined : 1}>
        {title}
      </Txt>
      <Txt
        variant="note"
        align="center"
        color={palette.secondary}
        style={typeAt('caption', 12, 12, fontLocale)}
      >
        {line}
      </Txt>
    </>
  );
  const style = {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: colours.cropCard,
    ...(ring ? { boxShadow: `inset 0 0 0 2px ${ring}` } : {}),
  } as const;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${title}, ${line}`} style={style}>
        {body}
      </View>
    );
  }
  return (
    <Press
      onPress={onPress}
      radius={20}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${line}`}
      {...(hint ? { accessibilityHint: hint } : {})}
      style={style}
    >
      {body}
    </Press>
  );
}

/**
 * Swapping crops at a friend's gate: one bundle for one, once in a while, when both farms have
 * the crop at harvest. Traded crops fill field guide pages on both farms. No prices, no shop.
 */
export function TradeScreen({
  farm,
  from,
  friend,
}: {
  readonly farm: FarmId;
  readonly from: FarmId;
  readonly friend: PersonId;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const api = useRhythmApi();
  const gate = useLoad(() => api.gate(farm), [api, farm]);
  if (gate.status === 'ready') return <Swap gate={gate.value} from={from} friend={friend} />;
  if (gate.status === 'failed') {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center' }}>
        <ErrorState
          art={<ArtStill scene="gate" width={240} height={180} />}
          title={t('rhythm.trade.title')}
          body={t('rhythm.loadFailed')}
          action={{ label: t('rhythm.tryAgain'), onPress: gate.reload }}
          secondary={{ label: t('rhythm.back'), onPress: () => router.back() }}
        />
      </View>
    );
  }
  return <View style={{ flex: 1, backgroundColor: palette.background }} />;
}

function Swap({
  gate,
  from,
  friend,
}: {
  readonly gate: FarmGate;
  readonly from: FarmId;
  readonly friend: PersonId;
}) {
  const { t, fontLocale } = useLocale();
  const { palette, appearance } = useTheme();
  const colours = rhythmColours[appearance];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const api = useRhythmApi();
  const toast = useToast();
  const mine = useFarm(from)?.state ?? null;
  // What your farm has in its basket to give, and giving nothing at all.
  const options = useMemo<readonly (Crop | null)[]>(
    () => [...(mine?.basket?.crops ?? []), null],
    [mine?.basket],
  );
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const give = options[pick % options.length] ?? null;
  const host = gate.critters.find((c) => c.person === friend) ?? gate.critters[0] ?? null;
  const name = host?.name ?? t('rhythm.someone');
  const { fruits } = fruitWords(t, gate.signature);
  const take = gate.signature;
  const tint = fruitColour(take);

  const swap = async () => {
    if (!take || busy) return;
    setBusy(true);
    haptics.soft();
    try {
      const result = await api.trade(gate.farm, {
        opId: newOpId(),
        from,
        with: host?.person ?? friend,
        give: give?.plant ?? null,
        take,
      });
      if (result.result === 'ack') {
        toast.show(
          give
            ? t('rhythm.trade.done', { fruits })
            : t('rhythm.trade.taken', {
                fruits: fruits.charAt(0).toLocaleUpperCase() + fruits.slice(1),
              }),
          'sparkle',
        );
        backToFarm();
        return;
      }
      toast.show(say(t, refusal(result.reason), { name }));
    } catch (error) {
      toast.show(
        error instanceof ApiError && error.status === 403
          ? t('rhythm.trade.noFarm')
          : t('rhythm.trade.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', top: 0, left: 0 }}>
        <ArtStill
          scene="visitfarm"
          width={width}
          height={430 * k}
          attrs={{ season: gate.season.season, fruit: tint }}
          t={1.2}
        />
        <NightVeil width={width} height={430 * k} />
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top - 1,
          left: 16,
          right: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 12,
        }}
      >
        <Press
          onPress={() => router.back()}
          radius={22}
          accessibilityRole="button"
          accessibilityLabel={t('rhythm.back')}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: palette.fillSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {ANDROID_BACK ? (
            <AndroidBackArrow color={palette.text} />
          ) : (
            <Txt variant="chevron" style={[typeAt('body', 24, 24, fontLocale), { marginTop: -3 }]}>
              ‹
            </Txt>
          )}
        </Press>
        <View style={{ alignItems: 'center' }} accessible accessibilityRole="header">
          <Txt variant="trayTitle" style={typeAt('button', 17, 20.4, fontLocale)}>
            {t('rhythm.trade.header', { name })}
          </Txt>
          <Txt
            variant="note"
            color={palette.secondary}
            style={typeAt('caption', 12.5, 16.25, fontLocale)}
          >
            {t('rhythm.trade.subtitle', { fruits })}
          </Txt>
        </View>
        <View style={{ width: 44 }} />
      </View>
      <Panel top={384 * k} style={{ paddingHorizontal: 20, zIndex: 20 }}>
        <View>
          <Txt variant="handL" color={colours.hand} style={typeAt('handL', 17, 18.7, fontLocale)}>
            {handText(t('rhythm.trade.eyebrow', { name }))}
          </Txt>
          <Txt variant="displayM" multiline accessibilityRole="header">
            {t('rhythm.trade.title')}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <CropCard
            crop={give?.plant ?? null}
            title={
              give
                ? t('rhythm.trade.yours', { plant: say(t, `farm.plant.${give.plant}`) })
                : t('rhythm.trade.nothing')
            }
            line={give ? t('rhythm.trade.bundle') : t('rhythm.trade.nothingLine')}
            {...(options.length > 1
              ? { onPress: () => setPick((p) => p + 1), hint: t('rhythm.trade.pick') }
              : {})}
          />
          <Txt
            variant="chevron"
            color={colours.swapArrow}
            importantForAccessibility="no"
            style={typeAt('body', 24, 24, fontLocale)}
          >
            ⇄
          </Txt>
          <CropCard
            crop={take}
            title={t('rhythm.trade.theirs', { name, fruits })}
            line={t('rhythm.trade.basket')}
            ring={tint}
          />
        </View>
        <Txt variant="notice" multiline color={colours.tradeNote}>
          {t('rhythm.trade.note')}
        </Txt>
        <ActionButton
          label={give ? t('rhythm.trade.swap', { name }) : t('rhythm.trade.take')}
          onPress={() => void swap()}
          bg={tint}
          fg={colours.onFruit}
          disabled={busy || !take}
        />
        <ActionButton
          label={t('rhythm.trade.justVisiting')}
          onPress={() => router.back()}
          bg="transparent"
          fg={palette.text}
          small
          style={{ height: 46 }}
        />
      </Panel>
    </View>
  );
}
