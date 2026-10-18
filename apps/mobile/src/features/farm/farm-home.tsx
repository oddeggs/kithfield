import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useFarm, useFarmView, useOpenFarm, useSend } from '../../data';
import { ArtStill } from '../../ui/art/art-view';
import { EmptyState } from '../../ui/components/state-shell';
import { Sheet, SheetScrollView } from '../../ui/components/sheet';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useArtVisible } from '../../ui/motion/visibility';
import { useSession } from '../../ui/session/session';
import { tabBarClearance } from '../../ui/tab-bar/tab-bar';
import { useYouCritter } from '../../ui/tab-bar/tab-activity';
import { useSunPlace, useTheme } from '../../ui/theme/theme-provider';
import { lookOf } from './farm-bake';
import { seasonLabel } from './farm-copy';
import { FarmHeader } from './farm-header';
import { FarmScene } from './farm-scene';
import { FarmSheetContent } from './farm-sheet';
import { momentFor } from './moments';
import { farmRoutes } from './routes';
import { sceneHeight } from './scene-layout';
import { useNow } from './use-now';
import { useFarmFlags, useValley } from './valley-store';

/** The sheet overlaps the bottom of the farm by this much (the farm is drawn 540 tall, the sheet rests at 500). */
const OVERLAP = 40;

/**
 * The welcome-back and move-in moments, decided as the farm opens and again when someone new
 * moves in while it is open. Each shows once (see `moments.ts`).
 */
function useMoments(farm: FarmId, me: string | null) {
  const state = useFarm(farm)?.state ?? null;
  const flags = useFarmFlags(farm);
  const latestJoin = state?.members.reduce((a, m) => Math.max(a, m.joinedAt), 0) ?? null;
  const handled = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const current = stateRef.current;
    if (!current || !me || latestJoin === null || handled.current === latestJoin) return;
    handled.current = latestJoin;
    let live = true;
    void (async () => {
      const [welcomed, joins] = await Promise.all([
        flags.read('welcomed'),
        flags.read('joinsSeen'),
      ]);
      if (!live) return;
      const moment = momentFor(current, me, Date.now(), {
        welcomed: welcomed === null ? null : Number(welcomed),
        joinsSeen: joins === null ? null : Number(joins),
      });
      if (moment.kind === 'welcome') {
        await flags.write('welcomed', String(moment.since));
        router.push(farmRoutes.welcome(farm));
        return;
      }
      if (moment.upTo !== null) await flags.write('joinsSeen', String(moment.upTo));
      if (moment.kind === 'moveIn') router.push(farmRoutes.moveIn(farm, moment.person));
    })();
    return () => {
      live = false;
    };
  }, [farm, me, latestJoin, flags]);
}

function FarmFor({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { width, height: screen } = useWindowDimensions();
  const height = sceneHeight(width);
  const me = useSession().person?.id ?? null;
  const now = useNow();
  useOpenFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const send = useSend(farm);
  const toast = useToast();
  const { appearance } = useTheme();
  const visible = useArtVisible();
  const reduce = useReduceMotion();
  const [sheet, setSheet] = useState(0);
  const self = state?.members.find((m) => m.person === me) ?? null;

  useSunPlace(state?.place ? { lat: state.place.lat, lng: state.place.lng } : null);
  useYouCritter(self ? { kind: self.critter.species, look: lookOf(self.critter) } : null);
  useMoments(farm, me);

  const openCritter = (person: string) =>
    router.push(person === me ? farmRoutes.bubble(farm) : farmRoutes.critter(farm, person));

  return (
    <View style={{ flex: 1 }}>
      <FarmScene
        state={state}
        view={view}
        me={me}
        width={width}
        height={height}
        night={appearance === 'night'}
        // The farm rests while the sheet covers it at full height.
        running={visible && !reduce && sheet === 0}
        now={now}
        targets={{
          onCritter: openCritter,
          onHouse: (h) =>
            h.former ? router.push(farmRoutes.cottage(farm, h.person)) : openCritter(h.person),
          onFire: () => toast.show(t('farm.fire.soon'), 'lantern'),
          onPatch: () => router.navigate(farmRoutes.seedbed()),
          onPlan: (p) => router.push(farmRoutes.plan(farm, p.seed.seq)),
        }}
      />
      {state && view ? (
        <FarmHeader
          name={state.name ?? ''}
          season={seasonLabel(t, view.season.season, view.today, state.hemisphere)}
          top={insets.top + 1}
          onSwitch={() => router.push(farmRoutes.valley())}
        />
      ) : null}
      {state && view ? (
        <Sheet
          detents={[screen - (height - OVERLAP), screen - insets.top - 60]}
          index={sheet}
          onIndexChange={(i) => setSheet(Math.max(0, i))}
        >
          <SheetScrollView
            contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarClearance(insets.bottom) }}
            showsVerticalScrollIndicator={false}
          >
            <FarmSheetContent
              state={state}
              view={view}
              me={me}
              actions={{
                onCredits: () => router.push(farmRoutes.critters(farm)),
                onPlan: (p) => router.push(farmRoutes.plan(farm, p.seed.seq)),
                onFirefly: (to) => router.push(farmRoutes.tray(farm, to)),
                // Opening what waits on the step: a firefly wakes your critter.
                onDoorstep: (d) =>
                  void (d.kind === 'gift' && d.gift
                    ? send('gift', { action: 'opened', gift: d.gift })
                    : send('firefly', { action: 'opened', target: d.seq })),
                onRose: () => router.navigate(farmRoutes.chat(farm)),
              }}
            />
          </SheetScrollView>
        </Sheet>
      ) : null}
    </View>
  );
}

/**
 * Says once that the person was taken off the farm the tab last showed. Leaving by choice
 * says nothing; a farm the phone can't tell about says nothing either.
 */
function useGoneNote(gone: FarmId | null, forget: () => void) {
  const client = useDataClient();
  const me = useSession().person?.id ?? null;
  useEffect(() => {
    if (gone === null || me === null) return;
    let live = true;
    void (async () => {
      const replica = await client.replica(gone);
      const former = replica.getState().state?.former.find((f) => f.person === me);
      const key = `farm:removedSeen:${gone}`;
      const seen = await client.store.meta(key);
      if (!live) return;
      forget();
      if (former?.how !== 'removed' || seen !== null) return;
      await client.store.transaction(() => client.store.setMeta(key, '1'));
      router.push(farmRoutes.removed(gone));
    })();
    return () => {
      live = false;
    };
  }, [client, gone, me, forget]);
}

/** The Farm tab: the farm you're on, or a way to plant the first one. */
export function FarmHome() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const valley = useValley();
  useGoneNote(valley.gone, valley.forget);

  if (valley.current) return <FarmFor key={valley.current} farm={valley.current} />;
  if (valley.status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  }
  const failed = valley.status === 'failed';
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <EmptyState
        art={<ArtStill scene="spot" width={240} height={180} attrs={{ name: 'empty' }} />}
        title={t('farm.empty.title')}
        body={failed ? t('farm.loadFailed') : t('farm.empty.body')}
        action={
          failed
            ? { label: t('shell.startFailed.action'), onPress: () => void valley.refresh() }
            : { label: t('farm.empty.action'), onPress: () => router.push(farmRoutes.newFarm()) }
        }
      />
    </View>
  );
}
