import type { DoorstepItem, FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useDataClient,
  useFarm,
  useFarmEvents,
  useFarmLink,
  useFarmView,
  useOpenFarm,
  useSend,
} from '../../data';
import { ArtLoop, ArtStill } from '../../ui/art/art-view';
import { sceneLook } from '../../ui/art/critter-look';
import { EmptyState } from '../../ui/components/state-shell';
import { Sheet, SheetScrollView } from '../../ui/components/sheet';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useArtVisible } from '../../ui/motion/visibility';
import { useSession } from '../../ui/session/session';
import { tabBarClearance } from '../../ui/tab-bar/tab-bar';
import { useYouCritter } from '../../ui/tab-bar/tab-activity';
import { useSunPlace, useTheme } from '../../ui/theme/theme-provider';
// The fire on the farm: its glow, who is by it, and the way into the fire room.
import { FireGlowCard, useFireOnFarm } from '../fire/fire-glow';
// A sticker pack given as a gift opens as the stickers' own parcel.
import { stickerRoutes } from '../stickers';
import { packOf } from '../stickers/model/catalogue';
// The farm's rhythm (birthdays, shared rain, weather, the project, the harvest letter).
import { RhythmSheetRows, RhythmWeatherChip, useRhythmMoments } from '../rhythm/farm-entries';
import { rhythmRoutes } from '../rhythm/routes';
import { lookOf } from './farm-bake';
import { seasonLabel } from './farm-copy';
import { FarmHeader } from './farm-header';
import { FarmScene } from './farm-scene';
import {
  DrawingLabel,
  FarmFog,
  FarmLoadFailed,
  FarmReveal,
  PencilRows,
  useOffline,
} from './farm-states';
import { useFarmLoading } from './farm-loading';
import { JustYou } from './just-you';
import { Panel } from './panel';
import { OfflineBanner, PostBag } from './post-bag';
import { FarmSheetContent } from './farm-sheet';
import { removalNote } from './removal-note';
import { farmRoutes } from './routes';
import { sceneHeight } from './scene-layout';
import { useFireWay, useHarvestWay } from './scene-ways';
import { reactionTo, SAID_MS, type FarmReaction } from './reactions';
import { useNow } from './use-now';
import { useOpenMoments } from './use-open-moments';
import { useValley } from './valley-store';

/** The sheet overlaps the bottom of the farm by this much (the farm is drawn 540 tall, the sheet rests at 500). */
const OVERLAP = 40;

/**
 * The farm reacting to a friend's message while it is open (signature motion): their words pop
 * over their cottage for a moment, one burst every four seconds at most.
 */
function useFarmReaction(farm: FarmId, me: string | null): FarmReaction | null {
  const events = useFarmEvents(farm, 10);
  const focused = useIsFocused();
  const so = useRef<{ afterSeq: number; lastAt: number | null } | null>(null);
  const [said, setSaid] = useState<FarmReaction | null>(null);
  useEffect(() => {
    if (events.length === 0) return;
    const newest = events.reduce((top, e) => Math.max(top, e.seq), 0);
    // What was there as the farm opened, or while it was out of sight, never pops up.
    if (so.current === null || !focused) {
      so.current = { afterSeq: newest, lastAt: so.current?.lastAt ?? null };
      return;
    }
    const now = Date.now();
    const next = reactionTo(events, me, so.current, now);
    so.current = { afterSeq: next.afterSeq, lastAt: next.reaction ? now : so.current.lastAt };
    if (next.reaction) setSaid(next.reaction);
  }, [events, focused, me]);
  useEffect(() => {
    if (!said) return;
    const timer = setTimeout(() => setSaid(null), SAID_MS);
    return () => clearTimeout(timer);
  }, [said]);
  return said;
}

/** Where the scene is drawn for a farm with only you on it, at the design's 393 points wide. */
const ALONE = { scene: 470, sheet: 440 } as const;
/** Where "drawing the farm…" sits over the scene, at the design's 393 points wide. */
const DRAWING_TOP = 250;

function FarmFor({
  farm,
  name,
}: {
  readonly farm: FarmId;
  /** The farm's name from the farm list, for the header while the farm itself loads. */
  readonly name: string | null;
}) {
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { width, height: screen } = useWindowDimensions();
  const height = sceneHeight(width);
  const me = useSession().person?.id ?? null;
  const now = useNow();
  useOpenFarm(farm);
  const held = useFarm(farm);
  const state = held?.state ?? null;
  const view = useFarmView<FarmView>(farm, now);
  const link = useFarmLink(farm);
  const offline = useOffline(link);
  const alone = state !== null && state.members.length === 1 && state.former.length === 0;
  // The farm is revealed once it is on the phone and drawn (a farm with only you on it draws at once).
  const [drawn, setDrawn] = useState(false);
  const loading = useFarmLoading(state !== null, alone || drawn);
  const k = width / 393;
  const send = useSend(farm);
  const { appearance, palette } = useTheme();
  const visible = useArtVisible();
  const reduce = useReduceMotion();
  const [sheet, setSheet] = useState(0);
  const fire = useFireOnFarm(farm);
  const fireWay = useFireWay(farm, { width, height, screen }, fire.lit);
  const harvestWay = useHarvestWay(farm, view, { width, height });
  const said = useFarmReaction(farm, me);
  const client = useDataClient();
  // A gift opens on the step (the shop's 09-05), or, for a sticker pack, as its parcel (08-06).
  const openGift = async (d: DoorstepItem, gift: string) => {
    const given = (await client.events(farm, { before: d.seq + 1, limit: 1 })).find(
      (e) => e.seq === d.seq,
    );
    // A member's `gift {given}`, or a visitor's gift left at the gate.
    const payload = given?.payload as { item?: unknown; gesture?: { item?: unknown } } | undefined;
    const item = payload?.item ?? payload?.gesture?.item;
    if (typeof item === 'string' && packOf(item) !== null) {
      router.push(stickerRoutes.opened(farm, d.seq));
    } else {
      router.push({ pathname: '/shop/step', params: { farm, gift } });
    }
  };
  const self = state?.members.find((m) => m.person === me) ?? null;

  useSunPlace(state?.place ? { lat: state.place.lat, lng: state.place.lng } : null);
  useYouCritter(self ? { kind: self.critter.species, look: lookOf(self.critter) } : null);
  useOpenMoments(farm, me);
  useRhythmMoments(farm, view, me);
  // Turned away by the farm (a removal the phone never saw, or a farm that is gone).
  const { lost } = useValley();
  const turnedAway =
    link.status === 'blocked' && (link.code === 'not_member' || link.code === 'farm_gone');
  useEffect(() => {
    if (turnedAway) void lost(farm);
  }, [turnedAway, lost, farm]);

  const openCritter = (person: string) =>
    router.push(person === me ? farmRoutes.bubble(farm) : farmRoutes.critter(farm, person));

  // Nothing of the farm on the phone and no way to reach it: the full-screen error. A farm with
  // anything cached shows that instead, in a fog.
  const unreachable =
    held !== null && state === null && (offline || (link.status === 'blocked' && !turnedAway));
  if (unreachable) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <FarmLoadFailed
          {...(link.status === 'blocked' ? { code: `KF-${link.code}` } : {})}
          onRetry={() => client.reconnect(farm)}
        />
      </View>
    );
  }

  // Only you on the farm so far: the sketched cottages wait for friends.
  const sceneH = alone ? ALONE.scene * k : height;
  const restingTop = alone ? ALONE.sheet * k : height - OVERLAP;
  const farmName = state?.name ?? name ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {alone ? (
        <ArtLoop
          scene="invite"
          width={width}
          height={sceneH}
          attrs={{
            ...(self ? sceneLook(self.critter) : {}),
            ...(view ? { season: view.season.season } : {}),
            ...(appearance === 'night' ? { night: true } : {}),
          }}
          paused={!visible || sheet !== 0}
        />
      ) : (
        <Animated.View
          style={[{ position: 'absolute', left: 0, top: 0, width, height }, fireWay.style]}
        >
          <FarmScene
            state={state}
            view={view}
            me={me}
            width={width}
            height={height}
            night={appearance === 'night'}
            // The farm rests while the sheet covers it at full height.
            running={visible && !reduce && sheet === 0}
            hints={visible && sheet === 0 && !offline && !loading.revealing && state !== null}
            onDrawn={() => setDrawn(true)}
            now={now}
            fire={fire}
            coverTop={height - OVERLAP}
            said={said}
            targets={{
              onCritter: openCritter,
              onHouse: (h) =>
                h.former ? router.push(farmRoutes.cottage(farm, h.person)) : openCritter(h.person),
              onFire: fireWay.open,
              onPatch: () => router.navigate(farmRoutes.seedbed()),
              onPlan: (p) => router.push(farmRoutes.plan(farm, p.seed.seq)),
            }}
          />
        </Animated.View>
      )}
      {loading.covered ? (
        <FarmReveal
          width={width}
          height={sceneH}
          ready={loading.revealing && loading.ready}
          onDone={loading.done}
        />
      ) : null}
      <FarmFog width={width} height={sceneH} on={offline && state !== null} />
      {loading.revealing && !loading.ready ? <DrawingLabel top={DRAWING_TOP * k} /> : null}
      {farmName && (state === null || view) ? (
        <FarmHeader
          name={farmName}
          season={
            state && view ? seasonLabel(t, view.season.season, view.today, state.hemisphere) : ''
          }
          top={insets.top + 1}
          onSwitch={() => router.push(farmRoutes.valley())}
        />
      ) : null}
      {offline && state ? <OfflineBanner top={insets.top + 57} /> : null}
      {state && view && !offline ? (
        <RhythmWeatherChip farm={farm} state={state} view={view} top={insets.top + 53} />
      ) : null}
      {loading.loading ? (
        <Panel top={restingTop}>
          <PencilRows />
        </Panel>
      ) : null}
      {state && view ? (
        <Sheet
          detents={[screen - restingTop, screen - insets.top - 60]}
          index={sheet}
          onIndexChange={(i) => setSheet(Math.max(0, i))}
        >
          <SheetScrollView
            contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarClearance(insets.bottom) }}
            showsVerticalScrollIndicator={false}
          >
            {offline ? <PostBag pending={held?.pending ?? []} farmName={farmName} /> : null}
            {alone ? (
              <View style={{ marginBottom: 24 }}>
                <JustYou onInvite={() => router.push(farmRoutes.invite(farm))} />
              </View>
            ) : null}
            {fire.line !== null ? (
              <View style={{ marginBottom: 12 }}>
                <FireGlowCard farm={farm} onOpen={fireWay.open} />
              </View>
            ) : null}
            <FarmSheetContent
              state={state}
              view={view}
              me={me}
              actions={{
                onCredits: () => router.push(farmRoutes.critters(farm)),
                onPlan: (p) => router.push(farmRoutes.plan(farm, p.seed.seq)),
                onFirefly: (to) => router.push(farmRoutes.tray(farm, to)),
                // Opening what waits on the step: a gift opens; a firefly wakes your critter.
                onDoorstep: (d) => {
                  if (d.kind === 'gift' && d.gift) {
                    void openGift(d, d.gift);
                    return;
                  }
                  void send('firefly', { action: 'opened', target: d.seq });
                },
                onRose: (person) => router.push(rhythmRoutes.birthday(farm, person)),
              }}
            />
            <RhythmSheetRows farm={farm} state={state} view={view} onRecap={harvestWay.open} />
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
      const held = replica.getState().state;
      const former = held?.former.find((f) => f.person === me) ?? null;
      const events = await client.events(gone, { limit: 200 });
      const removal = [...events]
        .reverse()
        .find(
          (e) => e.kind === 'removed' && (e.payload as { person?: unknown } | null)?.person === me,
        );
      const by = (removal?.payload as { by?: unknown } | undefined)?.by;
      const note = removalNote({
        former,
        by: by === 'keeper' || by === 'safety' ? by : null,
        stillHeld: held?.members.some((m) => m.person === me) ?? false,
      });
      const key = `farm:removedSeen:${gone}`;
      const seen = await client.store.meta(key);
      if (!live) return;
      forget();
      if (note === null || seen !== null) return;
      await client.store.transaction(() => client.store.setMeta(key, '1'));
      router.push(farmRoutes.removed(gone, note));
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

  if (valley.current) {
    const row = valley.farms.find((f) => f.farm === valley.current);
    return <FarmFor key={valley.current} farm={valley.current} name={row?.name ?? null} />;
  }
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
