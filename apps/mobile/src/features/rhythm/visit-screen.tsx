import type { FarmGate, FarmId, PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fruitColour, motion, rhythmColours } from '@kithfield/theme';

import { useFarm } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { sceneLook } from '../../ui/art/critter-look';
import { LayeredScene } from '../../ui/art/layered-scene';
import { ErrorState } from '../../ui/components/state-shell';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { fadeTo, sheetTo } from '../../ui/motion/motion';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { NightVeil, Panel } from '../farm/panel';
import { SpeechBubble } from '../farm/speech-bubble';
import { ActionButton, Faces, IconChip, TitlePill, TopBar } from './chrome';
import { handText, say } from './copy';
import { atGate } from './gate-calls';
import type { GateOutcome } from './gate-gestures';
import { useLoad, useRhythmApi } from './rhythm-api';
import { rhythmRoutes } from './routes';

const W = 393;

/** "plums", "a plum tree": a signature crop's words, or plain ones for a crop this app doesn't know. */
export function fruitWords(t: Parameters<typeof say>[0], signature: string | null) {
  const known = signature && ['plum', 'persimmon', 'lemon', 'fig'].includes(signature);
  const base = known ? `rhythm.fruit.${signature}` : 'rhythm.fruit.other';
  return { fruits: say(t, base), tree: say(t, `${base}.tree`) };
}

/** Your critter walks in from the gate as the visit opens; under Reduce Motion it fades in. */
function WalkIn({ farm, k }: { readonly farm: FarmId; readonly k: number }) {
  const reduce = useReduceMotion();
  const me = useSession().person?.id ?? null;
  const mine = useFarm(farm)?.state?.members.find((m) => m.person === me)?.critter ?? null;
  const x = useSharedValue(reduce ? 0 : -150 * k);
  const shown = useSharedValue(reduce ? 0 : 1);
  useEffect(() => {
    if (reduce) shown.set(fadeTo(1));
    // The critter sets off once the farm has faded in.
    else x.set(withDelay(motion.fade.durationMs, sheetTo(0, false)));
  }, [reduce, shown, x]);
  const walk = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateX: x.get() }],
  }));
  if (!mine) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 166 * k, top: 420 * k }, walk]}
    >
      <ArtStill
        scene="pose"
        width={64 * k}
        height={72 * k}
        attrs={{ ...sceneLook(mine), pose: 'awake', color: 'none' }}
        t={1.2}
      />
    </Animated.View>
  );
}

/**
 * Visiting a friend's farm at its gate: its season, what grows, its fruit and who lives there.
 * You can leave a firefly or a wave; their chat is never shown.
 */
export function VisitScreen({
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
  if (gate.status === 'ready') return <Gate gate={gate.value} from={from} friend={friend} />;
  if (gate.status === 'failed') {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: 'center' }}>
        <ErrorState
          art={<ArtStill scene="gate" width={240} height={180} />}
          title={t('rhythm.gates.title')}
          body={t('rhythm.loadFailed')}
          action={{ label: t('rhythm.tryAgain'), onPress: gate.reload }}
          secondary={{ label: t('rhythm.back'), onPress: () => router.back() }}
        />
      </View>
    );
  }
  return <View style={{ flex: 1, backgroundColor: palette.background }} />;
}

function Gate({
  gate,
  from,
  friend,
}: {
  readonly gate: FarmGate;
  readonly from: FarmId;
  readonly friend: PersonId;
}) {
  const { t } = useLocale();
  const { palette, appearance } = useTheme();
  const colours = rhythmColours[appearance];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const k = width / W;
  const api = useRhythmApi();
  const toast = useToast();
  const [left, setLeft] = useState<'firefly' | 'wave' | null>(null);
  const [busy, setBusy] = useState(false);
  const host = gate.critters.find((c) => c.person === friend) ?? gate.critters[0] ?? null;
  const name = host?.name ?? t('rhythm.someone');
  const { fruits, tree } = fruitWords(t, gate.signature);
  const ripe = gate.signature !== null && gate.inSeason.includes(gate.signature);

  const leave = async (gesture: 'firefly' | 'wave') => {
    if (busy || left) return;
    setBusy(true);
    haptics.soft();
    const outcome: GateOutcome = await atGate(
      api,
      gate.farm,
      gesture === 'wave' ? { gesture: 'wave' } : { gesture: 'firefly', to: host?.person ?? friend },
    );
    setBusy(false);
    if (outcome.ok) setLeft(gesture);
    else toast.show(say(t, outcome.message));
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', top: 0, left: 0 }}>
        <LayeredScene
          scene="farm"
          width={width}
          height={540 * k}
          attrs={{
            season: gate.season.season,
            alt: true,
            ...(gate.signature ? { fruit: gate.signature } : {}),
          }}
        />
        <NightVeil width={width} height={540 * k} />
      </View>
      <WalkIn farm={from} k={k} />
      {ripe ? (
        <SpeechBubble
          text={handText(t('rhythm.visit.ripe', { fruits }))}
          tail="right"
          running={false}
          style={{ position: 'absolute', left: 250 * k, top: 148 * k }}
        />
      ) : null}
      <TopBar
        top={insets.top - 1}
        onBack={() => router.back()}
        center={<TitlePill title={gate.name} subtitle={t('rhythm.visit.subtitle')} serif />}
      />
      <Panel top={500 * k} style={{ paddingHorizontal: 20 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <Txt variant="displayM" multiline accessibilityRole="header" style={{ flex: 1 }}>
            {gate.name}
          </Txt>
          <Faces
            critters={gate.critters.slice(0, 5).map((c) => c.critter)}
            size={28}
            ring={palette.sheet}
          />
        </View>
        <Txt variant="sheetBody" multiline color={palette.body}>
          {gate.signature
            ? t('rhythm.visit.body', { name, fruits, tree })
            : t('rhythm.visit.bodyPlain', { name })}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <IconChip
            label={left === 'firefly' ? t('rhythm.visit.fireflyLeft') : t('rhythm.visit.firefly')}
            icon="firefly"
            bg={colours.gateChip.bg}
            fg={colours.gateChip.fg}
            disabled={left !== null}
            onPress={() => void leave('firefly')}
          />
          <IconChip
            label={left === 'wave' ? t('rhythm.visit.waved') : t('rhythm.visit.wave')}
            icon="wave"
            bg={colours.gateChip.bg}
            fg={colours.gateChip.fg}
            disabled={left !== null}
            onPress={() => void leave('wave')}
          />
        </View>
      </Panel>
      {gate.signature ? (
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: 34 }}>
          <ActionButton
            label={t('rhythm.visit.take', { fruits })}
            onPress={() => router.push(rhythmRoutes.trade(gate.farm, from, host?.person ?? friend))}
            bg={fruitColour(gate.signature)}
            fg={colours.onFruit}
          />
        </View>
      ) : null}
    </View>
  );
}
