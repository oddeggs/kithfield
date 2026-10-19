import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { screens } from '@kithfield/theme';
import { router } from 'expo-router';
import { View } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { motion } from '@kithfield/theme';

import { useFarm, useFarmView, useOpenFarm } from '../../data';
import { ArtIcon } from '../../ui/art/art-view';
import { Glass } from '../../ui/components/glass';
import { usePane } from '../../ui/layout/pane';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useArtVisible } from '../../ui/motion/visibility';
import { useSession } from '../../ui/session/session';
import { useSunPlace, useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
// The fire on the farm, and the way into the fire room.
import { openFire, useFireOnFarm } from '../fire/fire-glow';
import { seasonLabel } from './farm-copy';
import { FarmHeader } from './farm-header';
import { useFarmReaction } from './farm-home';
import { FarmScene } from './farm-scene';
import { farmRoutes } from './routes';
import { useNow } from './use-now';
import { useValley } from './valley-store';

const note = screens.farmNote;

/**
 * The live farm in a column of its own beside the chat (`14 Platforms`): the farm you're on,
 * awake, reacting as the chat goes (a friend's critter holds up their words), and a way into the
 * farm full screen. On an opened foldable it wears the farm's name, as the farm tab does.
 */
export function LiveFarm({ named = false }: { readonly named?: boolean }) {
  const valley = useValley();
  const { palette } = useTheme();
  if (valley.current === null)
    return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  const row = valley.farms.find((f) => f.farm === valley.current);
  return (
    <LiveFarmFor
      key={valley.current}
      farm={valley.current}
      name={named ? (row?.name ?? null) : null}
      named={named}
    />
  );
}

function LiveFarmFor({
  farm,
  name,
  named,
}: {
  readonly farm: FarmId;
  readonly name: string | null;
  readonly named: boolean;
}) {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const pane = usePane();
  const { appearance, palette } = useTheme();
  const me = useSession().person?.id ?? null;
  const now = useNow();
  useOpenFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const visible = useArtVisible();
  const reduce = useReduceMotion();
  const fire = useFireOnFarm(farm);
  const said = useFarmReaction(farm, me);
  useSunPlace(state?.place ? { lat: state.place.lat, lng: state.place.lng } : null);

  // An opened foldable draws the farm up under the status bar, as the farm tab does; the iPad's
  // column starts under it, on the paper.
  const top = named ? 0 : insets.top;
  const width = pane.width;
  const height = pane.height - top;
  const openCritter = (person: string) =>
    router.push(person === me ? farmRoutes.bubble(farm) : farmRoutes.critter(farm, person));
  const saidBy = said ? (state?.members.find((m) => m.person === said.person)?.name ?? null) : null;
  const farmName = state?.name ?? name ?? '';
  const openFull = () => router.navigate(farmRoutes.home());
  // The farm's own targets (critters, cottages, the fire) are taps nested inside this one, and
  // win over it.
  const tapAway = useTapGesture({
    onActivate: () => {
      'worklet';
      scheduleOnRN(openFull);
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: top }}>
      {/* A tap on the farm away from its critters and places opens it full screen. VoiceOver keeps
          the critters and places, and reaches the same way in through its own button. */}
      <GestureDetector gesture={tapAway}>
        <View style={{ width, height }}>
          <FarmScene
            state={state}
            view={view}
            me={me}
            width={width}
            height={height}
            night={appearance === 'night'}
            running={visible && !reduce}
            now={now}
            fire={fire}
            said={said}
            targets={{
              onCritter: openCritter,
              onHouse: (h) =>
                h.former ? router.push(farmRoutes.cottage(farm, h.person)) : openCritter(h.person),
              onFire: () => openFire(farm),
              onPatch: () => router.navigate(farmRoutes.seedbed()),
              onPlan: (p) => router.push(farmRoutes.plan(farm, p.seed.seq)),
            }}
          />
        </View>
      </GestureDetector>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('layout.farm.open')}
        onAccessibilityTap={openFull}
        style={{ position: 'absolute', left: 0, top, width: 1, height: 1 }}
      />
      {named && farmName ? (
        <FarmHeader
          name={farmName}
          season={
            state && view ? seasonLabel(t, view.season.season, view.today, state.hemisphere) : ''
          }
          top={insets.top + 1}
          onSwitch={() => router.push(farmRoutes.valley())}
        />
      ) : null}
      {said && saidBy ? (
        <Animated.View
          key={said.key}
          entering={FadeIn.duration(motion.fade.durationMs)}
          exiting={FadeOut.duration(motion.fade.durationMs)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: note.inset,
            right: note.inset,
            bottom: note.inset + (named ? insets.bottom : 0),
          }}
        >
          <Glass
            radius={note.radius}
            fill={palette.glassButton.fill}
            border={palette.glassButton.border}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 10,
              paddingHorizontal: 12,
            }}
          >
            <ArtIcon name="sparkle" size={18} color={palette.go.bg} />
            <Txt
              variant="caption"
              multiline
              numberOfLines={2}
              style={{ flex: 1, fontSize: 12.5, lineHeight: 17 }}
            >
              {t('layout.farm.reacts', { name: saidBy, text: said.text })}
            </Txt>
          </Glass>
        </Animated.View>
      ) : null}
    </View>
  );
}
