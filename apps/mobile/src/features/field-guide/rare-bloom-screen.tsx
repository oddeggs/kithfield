import type { FarmId, FarmState, PersonId, RareVariant } from '@kithfield/contracts';
import { RARE_VARIANTS } from '@kithfield/farm';
import { fieldGuideWashes } from '@kithfield/theme';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFarm, useFarmEvents } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { LayeredScene } from '../../ui/art/layered-scene';
import { Button } from '../../ui/components/button';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { say } from '../farm/farm-copy';
import { NightVeil } from '../farm/panel';
import { typeAt } from '../farm/type-at';
import { capital, variantOf } from './guide-copy';
import { useGuideLook } from './guide-look';
import { variantArt } from './guide-model';
import { rareBloomByKey } from './moments';
import { rareBody } from './page-copy';
import { HeroSheet, PlantTile, RoundButton } from './parts';
import { fieldGuideRoutes } from './routes';
import { useMarkRareSeen } from './use-moments';

const W = 393;
/** Each of the bloom's three held drawings, on twos. */
const HOLD_MS = 250;

/** Who was on the farm in the shared rain that rolled this bloom, if the phone holds that day. */
function useSharedRainPeople(farm: FarmId, day: string | null): readonly PersonId[] | null {
  const events = useFarmEvents(farm, 200);
  if (!day) return null;
  const rain = [...events].reverse().find((e) => e.kind === 'shared_rain' && e.day === day);
  const payload = rain?.payload as { readonly people?: unknown } | undefined;
  return Array.isArray(payload?.people)
    ? payload.people.filter((p): p is string => typeof p === 'string')
    : null;
}

/**
 * A rare bloom, shown once: the plant opening in three held drawings in its weather's colour,
 * rain falling over it on twos, what made it rare, the three variants, and the way to its page.
 */
export function RareBloomScreen({
  farm,
  bloomKey,
}: {
  readonly farm: FarmId;
  readonly bloomKey: string;
}) {
  const me = useSession().person?.id ?? null;
  const state = useFarm(farm)?.state ?? null;
  const bloom = state ? rareBloomByKey(state, bloomKey) : null;
  const rolled = state?.plants.find((p) => p.plant === bloom?.plant)?.rareRolledOn ?? null;
  const people = useSharedRainPeople(farm, rolled);
  const markSeen = useMarkRareSeen(farm);
  const marked = useRef<string | null>(null);
  useEffect(() => {
    // Marked once, when the moment first shows.
    if (!state || !bloom || marked.current === bloom.key) return;
    marked.current = bloom.key;
    void markSeen(state, bloom.key);
  }, [state, bloom, markSeen]);
  return <RareBloomPage farm={farm} state={state} me={me} bloomKey={bloomKey} people={people} />;
}

/** The rare bloom drawn from a farm, and who was there in the shared rain if known. */
export function RareBloomPage({
  farm,
  state,
  me,
  bloomKey,
  people,
}: {
  readonly farm: FarmId;
  readonly state: FarmState | null;
  readonly me: PersonId | null;
  readonly bloomKey: string;
  readonly people: readonly PersonId[] | null;
}) {
  const { t, language, fontLocale } = useLocale();
  const { palette } = useTheme();
  const look = useGuideLook();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const reduce = useReduceMotion();
  const bloom = state ? rareBloomByKey(state, bloomKey) : null;
  const step = useSharedValue(reduce ? 2 : 0);
  useEffect(() => {
    if (reduce) {
      step.set(2);
      return;
    }
    const at = (n: number) => withTiming(n, { duration: 0, reduceMotion: ReduceMotion.Never });
    step.set(withSequence(at(0), withDelay(HOLD_MS, at(1)), withDelay(HOLD_MS, at(2))));
  }, [reduce, step]);
  const bud = useAnimatedStyle(() => ({ opacity: step.get() === 0 ? 1 : 0 }));
  const opening = useAnimatedStyle(() => ({ opacity: step.get() === 1 ? 1 : 0 }));
  const open = useAnimatedStyle(() => ({ opacity: step.get() === 2 ? 1 : 0 }));

  const close = () => router.back();
  const back = (
    <View style={{ position: 'absolute', top: insets.top - 1, left: 16 }}>
      <RoundButton label={t('fieldGuide.close')} onPress={close} />
    </View>
  );
  if (!state || !bloom) {
    return <View style={{ flex: 1, backgroundColor: palette.sheet }}>{back}</View>;
  }

  const tint = fieldGuideWashes.rare[bloom.variant];
  const art = variantArt(bloom.variant);
  const heroH = 520 * k;
  const heroTop = 40 * k;
  const hero = { scene: 'plant', width, height: heroH } as const;
  const rare = variantOf(t, language, state, bloom.variant, bloom.plant);
  const seeIt = () => {
    router.back();
    router.push(fieldGuideRoutes.plant(farm, bloom.plant, bloom.variant));
  };

  return (
    <View style={{ flex: 1, backgroundColor: tint }}>
      <View style={{ position: 'absolute', left: 0, top: heroTop, width, height: heroH }}>
        <Animated.View style={[{ position: 'absolute' }, bud]}>
          <ArtStill {...hero} attrs={{ name: bloom.plant, stage: 2, color: tint }} />
        </Animated.View>
        <Animated.View
          style={[
            { position: 'absolute', transform: [{ scale: 0.92 }], transformOrigin: 'bottom' },
            opening,
          ]}
        >
          <ArtStill {...hero} attrs={{ name: bloom.plant, stage: 3, color: tint }} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute' }, open]}>
          <LayeredScene
            {...hero}
            attrs={{ name: bloom.plant, stage: 3, state: art, color: tint }}
            tolerance={8}
            budget={40e6}
          />
        </Animated.View>
      </View>
      <NightVeil width={width} height={heroTop + heroH} />
      {back}
      <HeroSheet top={470 * k}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 12,
            gap: 12,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Txt
              variant="handL"
              color={look.rareEyebrow}
              style={typeAt('handL', 18, 19.8, fontLocale)}
            >
              {t('fieldGuide.rare.eyebrow')}
            </Txt>
            <Txt
              variant="displayM"
              align="center"
              multiline
              accessibilityRole="header"
              style={typeAt('displayM', 28, 31.4, fontLocale)}
            >
              {capital(t('fieldGuide.rare.title', { rare }))}
            </Txt>
            <Txt
              variant="body"
              align="center"
              multiline
              color={palette.body}
              style={{ ...typeAt('body', 15, 21.75, fontLocale), maxWidth: 310 }}
            >
              {rareBody(t, state, me, bloom.plant, bloom.variant, people)}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {RARE_VARIANTS.map((v) => (
              <VariantCard key={v.id} variant={v.id} art={v.artState} />
            ))}
          </View>
          <Button label={t('fieldGuide.rare.cta')} onPress={seeIt} />
        </ScrollView>
      </HeroSheet>
    </View>
  );
}

function VariantCard({ variant, art }: { readonly variant: RareVariant; readonly art: string }) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderRadius: 16,
        backgroundColor: palette.card,
      }}
    >
      <PlantTile art={{ plant: 'poppy', stage: 3, state: art, color: palette.card }} width={64} />
      <Txt variant="rowTitle" align="center" style={typeAt('rowTitle', 12, 13.2, fontLocale)}>
        {say(t, `fieldGuide.variantName.${variant}`)}
      </Txt>
      <Txt
        variant="caption"
        align="center"
        multiline
        color={palette.secondary}
        style={typeAt('caption', 11, 13.75, fontLocale)}
      >
        {say(t, `fieldGuide.variantHint.${variant}`)}
      </Txt>
    </View>
  );
}
