import type { FarmId, Seq } from '@kithfield/contracts';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useOpenFarm } from '../../data';
import { ArtIcon } from '../../ui/art/art-view';
import { Glass } from '../../ui/components/glass';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { Txt } from '../../ui/type/text';
import { GlassBack } from './chrome';
import { formatTime } from './dates';
import { openDirections } from './directions';
import { Arriving, Campfire } from './hangout-art';
import { personOn } from './people';
import { fireside } from './plan-look';
import { canCheckIn, planDay, planTime } from './plan-status';
import { hangoutPhoto } from './photo-seam';
import { useMe, usePlan, usePlanRejections, usePlanSend } from './use-plans';

/** A dark glass control over the fire. */
function FireButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  readonly label: string;
  readonly icon?: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      radius={23}
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 46,
        borderRadius: 23,
        backgroundColor: fireside.button,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon ? <ArtIcon name={icon} size={22} color={fireside.text} /> : null}
      <Txt variant="buttonSmall" color={fireside.text}>
        {label}
      </Txt>
    </Press>
  );
}

/**
 * Hangout day: everyone at the campfire. "I'm here" checks in; a lone check-in grows
 * nothing, and when a second friend arrives the hangout grows the farm for everyone there.
 * Critters walk in as friends arrive. Directions only when asked.
 */
export function Hangout({ farm, seq }: { readonly farm: FarmId; readonly seq: Seq }) {
  useOpenFarm(farm);
  usePlanRejections();
  const { t } = useLocale();
  const { width, height } = useWindowDimensions();
  const { show } = useToast();
  const me = useMe();
  const send = usePlanSend(farm);
  const here = usePlan(farm, seq);
  const [busy, setBusy] = useState(false);
  const seenAtOpen = useRef<ReadonlySet<string> | null>(null);
  const plan = here?.plan;
  const season = here?.state.season.season ?? 'spring';
  if (here && plan && seenAtOpen.current === null) seenAtOpen.current = new Set(plan.seed.checkins);

  const seed = plan?.seed ?? null;
  const today = here?.view.today ?? null;
  const onTheDay = !!seed && !!today && canCheckIn(seed, today);
  const people = seed && here ? seed.checkins.map((p) => personOn(here.state, p, me, t)) : [];
  const imHere = people.some((p) => p.you);
  const latest = [...people].reverse().find((p) => !p.you);
  const line =
    people.length === 0
      ? t('plans.hangout.nobody')
      : people.length === 1
        ? imHere
          ? t('plans.hangout.justYou')
          : t('plans.hangout.first', { name: people[0]?.name ?? '' })
        : t('plans.hangout.came', { name: latest?.name ?? '' });
  const time = seed ? planTime(seed, planDay(seed)) : null;
  const where = seed?.place
    ? time
      ? t('plans.hangout.where', { place: seed.place.name, time: formatTime(t, time) })
      : seed.place.name
    : null;
  const addPhoto = hangoutPhoto();

  const checkIn = async () => {
    if (!seed || busy || imHere) return;
    if (!onTheDay) {
      show(t('plans.hangout.notToday'));
      return;
    }
    setBusy(true);
    if (await send('checkin', { seed: seed.seq })) haptics.success();
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: fireside.sky }}>
      <StatusBar style="light" />
      <Campfire width={width} height={height} season={season} />
      <View
        style={{
          position: 'absolute',
          top: 60,
          left: 16,
          right: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <GlassBack fill={fireside.glass} border={fireside.glassBorder} color={fireside.text} />
        {seed?.title ? (
          <Glass
            radius={18}
            fill={fireside.glass}
            border={fireside.glassBorder}
            style={{ height: 36, paddingHorizontal: 14, justifyContent: 'center', flexShrink: 1, marginLeft: 12 }}
          >
            <Txt variant="buttonSmall" color={fireside.text} numberOfLines={1} style={{ fontSize: 13, lineHeight: 13 }}>
              {t('plans.hangout.pill', { title: seed.title })}
            </Txt>
          </Glass>
        ) : null}
      </View>
      <View style={{ position: 'absolute', top: 126, left: 26, right: 26 }}>
        <Txt variant="displayL" color={fireside.title} accessibilityRole="header" style={{ fontSize: 38, lineHeight: 39.9 }}>
          {people.length > 0 ? t('plans.hangout.lit') : t('plans.hangout.waiting')}
        </Txt>
        {where ? (
          <Txt variant="body" color={fireside.sub} style={{ lineHeight: 21, marginTop: 6 }}>
            {where}
          </Txt>
        ) : null}
      </View>
      <Glass
        radius={44}
        fill={fireside.sheet}
        border={fireside.sheetBorder}
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          paddingTop: 18,
          paddingHorizontal: 18,
          paddingBottom: 30,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 3 }} accessible accessibilityLiveRegion="polite">
            <Txt variant="rowTitle" color={fireside.label} style={{ fontSize: 13, lineHeight: 13 }}>
              {t('plans.hangout.around')}
            </Txt>
            <Txt variant="handL" multiline color={fireside.text} style={{ fontSize: 19, lineHeight: 20.9 }}>
              {line}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {people.map((p, i) => (
              <Arriving
                key={p.person}
                who={p}
                size={30}
                ring={fireside.ring}
                first={i === 0}
                arriving={!(seenAtOpen.current?.has(p.person) ?? true)}
              />
            ))}
          </View>
        </View>
        <Press
          onPress={() => void checkIn()}
          disabled={busy || imHere || !seed}
          haptic="tap"
          radius={28}
          accessibilityLabel={imHere ? t('plans.hangout.youreHere') : t('plans.hangout.here')}
          testID="plans-checkin"
          style={{
            height: 56,
            borderRadius: 28,
            backgroundColor: fireside.here,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: imHere || !onTheDay ? 0.6 : 1,
          }}
        >
          <Txt variant="button" color={fireside.hereText}>
            {imHere ? t('plans.hangout.youreHere') : t('plans.hangout.here')}
          </Txt>
        </Press>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <FireButton
            label={t('plans.hangout.photo')}
            icon="camera"
            disabled={!addPhoto || !seed}
            onPress={() => {
              if (addPhoto && seed) void addPhoto(farm, seed.seq).catch(() => show(t('plans.refused')));
            }}
          />
          <FireButton
            label={t('plans.hangout.directions')}
            disabled={!seed?.place}
            onPress={() => {
              if (seed?.place) void openDirections(seed.place);
            }}
          />
        </View>
      </Glass>
    </View>
  );
}
