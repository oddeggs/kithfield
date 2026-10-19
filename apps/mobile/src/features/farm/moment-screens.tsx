import type { FarmId, PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm } from '../../data';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { sceneLook } from '../../ui/art/critter-look';
// A wave goes through the gestures' send, which explains a refusal in a toast.
import { useGestureSend } from '../gestures/send';
import { castOf } from './farm-bake';
import { listOf } from './farm-copy';
import { MoveInScene } from './move-in-walk';
import { withAlpha } from './over-art';
import { GlyphButton, Panel, SceneArt } from './panel';
import { waveThenGo } from './moments';
import { farmRoutes } from './routes';
import { SpeechBubble } from './speech-bubble';
import { typeAt } from './type-at';

const W = 393;

/** Welcome back: the farm says hello after a week or more away. Hugs, never a list. */
export function WelcomeBack({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const state = useFarm(farm)?.state ?? null;
  const me = useSession().person?.id ?? null;
  const send = useGestureSend(farm);
  const name = state?.members.find((m) => m.person === me)?.name ?? '';
  // A refused wave says why in a toast and stays here.
  const sayHi = () =>
    waveThenGo(
      () => send('wave', {}, { haptic: 'soft' }),
      () => {
        router.back();
        router.navigate(farmRoutes.chat(farm));
      },
    );
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {/* The rabbit is up and everyone leans in: the scene a few seconds into its wake-up. */}
      <SceneArt
        scene="welcome"
        width={width}
        height={610 * k}
        attrs={{ season: state?.season.season ?? 'spring' }}
        t={3.5}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 470 * k,
          height: 140 * k,
          experimental_backgroundImage: `linear-gradient(${withAlpha(palette.background, 0)}, ${palette.background} 62%)`,
        }}
      />
      <SpeechBubble
        text={t('farm.welcome.missed')}
        running={false}
        style={{ left: 26 * k, top: 388 * k }}
      />
      <SpeechBubble
        text={t('farm.welcome.kettle')}
        tail="right"
        running={false}
        style={{ right: 22 * k, top: 430 * k }}
      />
      <View style={{ position: 'absolute', left: 28, right: 28, top: 556 * k, gap: 8 }}>
        <Txt variant="displayL" multiline align="center" accessibilityRole="header">
          {t('farm.welcome.title', { name })}
        </Txt>
        <Txt variant="sheetBody" multiline align="center" color={palette.body}>
          {t('farm.welcome.body')}
        </Txt>
      </View>
      <View
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: Math.max(insets.bottom, 34),
          gap: 4,
        }}
      >
        <Button label={t('farm.welcome.hi')} onPress={() => void sayHi()} />
        <Button label={t('farm.welcome.look')} kind="text" onPress={() => router.back()} />
      </View>
    </View>
  );
}

/** Confetti falls on twos for 4 seconds, then the scene rests and the newcomer walks home. */
const CONFETTI_MS = 4000;

/** Move-in day: a new critter's cottage is lit, and the neighbours come out. */
export function MoveIn({ farm, person }: { readonly farm: FarmId; readonly person: PersonId }) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const k = width / W;
  const state = useFarm(farm)?.state ?? null;
  const me = useSession().person?.id ?? null;
  const send = useGestureSend(farm);
  const [celebrating, setCelebrating] = useState(!reduce);
  // Once the confetti has fallen, the newcomer walks home.
  const [walk, setWalk] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setCelebrating(false);
      setWalk(true);
    }, CONFETTI_MS);
    return () => clearTimeout(timer);
  }, []);
  const newcomer = state?.members.find((m) => m.person === person) ?? null;
  if (!state || !newcomer) return <View style={{ flex: 1, backgroundColor: palette.background }} />;

  const mine = person === me;
  const name = newcomer.name ?? t('farm.someone');
  const neighbours = state.members.filter((m) => m.person !== person);
  const others = neighbours.filter((m) => m.person !== me).map((m) => m.name ?? t('farm.someone'));
  const c = newcomer.critter;
  const attrs = {
    ...sceneLook(c),
    season: state.season.season,
    cast: neighbours
      .slice(0, 4)
      .map((m) => castOf(m.critter))
      .join(','),
  };
  const height = 540 * k;
  const close = () => router.back();
  const wave = () =>
    waveThenGo(
      () => send('wave', { to: person }, { haptic: 'soft' }),
      () => {
        router.back();
        router.navigate(farmRoutes.chat(farm));
      },
    );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <MoveInScene
        farm={farm}
        person={person}
        critter={c}
        attrs={attrs}
        width={width}
        height={height}
        celebrating={celebrating}
        walk={walk}
      />
      <GlyphButton
        glyph="✕"
        label={t('farm.close')}
        side="right"
        top={insets.top - 1}
        onPress={close}
      />
      <Panel top={512 * k} style={{ gap: 14 }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Txt variant="handS" style={typeAt('handS', 18, 20, fontLocale)} color={palette.go.bg}>
            {mine ? t('farm.moveIn.mineEyebrow') : t('farm.moveIn.eyebrow')}
          </Txt>
          <Txt
            variant="displayL"
            style={typeAt('displayL', 32, 35, fontLocale)}
            multiline
            align="center"
            accessibilityRole="header"
          >
            {mine ? t('farm.moveIn.mineTitle') : t('farm.moveIn.title', { name })}
          </Txt>
          <Txt
            variant="sheetBody"
            multiline
            align="center"
            color={palette.body}
            style={{ maxWidth: 300 }}
          >
            {mine
              ? t('farm.moveIn.mineBody')
              : others.length > 0
                ? t('farm.moveIn.body', { names: listOf(t, others.slice(0, 4)) })
                : t('farm.moveIn.bodyAlone')}
          </Txt>
        </View>
        {mine ? (
          <>
            <Button
              label={t('farm.moveIn.invite')}
              icon="door"
              onPress={() => router.replace(farmRoutes.farmSettings(farm))}
            />
            <Button
              label={t('farm.moveIn.look')}
              kind="secondary"
              size="medium"
              style={{ minHeight: 50 }}
              onPress={close}
            />
          </>
        ) : (
          <>
            <Button label={t('farm.moveIn.wave')} icon="wave" onPress={() => void wave()} />
            <Button
              label={t('farm.moveIn.show', { name })}
              kind="secondary"
              size="medium"
              style={{ minHeight: 50 }}
              onPress={close}
            />
          </>
        )}
      </Panel>
    </View>
  );
}
