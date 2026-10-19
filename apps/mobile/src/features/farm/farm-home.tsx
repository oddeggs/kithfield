import type { DoorstepItem, FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDataClient, useFarm, useFarmLink, useFarmView, useOpenFarm, useSend } from '../../data';
import { ArtLoop, ArtStill } from '../../ui/art/art-view';
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
import { FireGlowCard, openFire, useFireOnFarm } from '../fire/fire-glow';
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
  useFarmLoading,
  useOffline,
} from './farm-states';
import { JustYou } from './just-you';
import { Panel } from './panel';
import { OfflineBanner, PostBag } from './post-bag';
import { FarmSheetContent } from './farm-sheet';
import { momentFor, visitBefore } from './moments';
import { removalNote } from './removal-note';
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
  const client = useDataClient();
  const held = useFarm(farm);
  const state = held?.state ?? null;
  const flags = useFarmFlags(farm);
  const latestJoin = state?.members.reduce((a, m) => Math.max(a, m.joinedAt), 0) ?? null;
  const handled = useRef<number | null>(null);
  const openedAt = useRef(Date.now());
  const heldRef = useRef(held);
  heldRef.current = held;
  useEffect(() => {
    const current = heldRef.current;
    if (!current?.state || !me || latestJoin === null || handled.current === latestJoin) return;
    const first = handled.current === null;
    handled.current = latestJoin;
    const farmState = current.state;
    let live = true;
    void (async () => {
      const [welcomed, joins] = await Promise.all([
        flags.read('welcomed'),
        flags.read('joinsSeen'),
      ]);
      // A farm first read from the server (a fresh install) already counts this visit as the
      // last one: the visit before it is looked up in the log instead.
      const self = farmState.members.find((m) => m.person === me);
      const thisVisit = openedAt.current - 60_000;
      let lastVisit: number | null | undefined;
      if (first && self?.lastOpenedAt != null && self.lastOpenedAt >= thisVisit) {
        // The log's newest page, if the server answers soon; what the phone holds otherwise.
        await Promise.race([
          client.pageHistory(farm, current.lastSeq + 1, 200).catch(() => false),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        lastVisit = visitBefore(await client.events(farm, { limit: 200 }), me, thisVisit);
      }
      if (!live) return;
      const moment = momentFor(farmState, me, Date.now(), {
        welcomed: welcomed === null ? null : Number(welcomed),
        joinsSeen: joins === null ? null : Number(joins),
        ...(lastVisit === undefined ? {} : { lastVisit }),
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
  }, [client, farm, me, latestJoin, flags]);
}

/** Where the scene is drawn for a farm with only you on it, at the design's 393 points wide. */
const ALONE = { scene: 470, sheet: 440 } as const;
/** Where "drawing the farm…" sits over the scene, at the design's 393 points wide. */
const DRAWING_TOP = 250;

function FarmFor({
  farm,
  name,
  onRetry,
}: {
  readonly farm: FarmId;
  /** The farm's name from the farm list, for the header while the farm itself loads. */
  readonly name: string | null;
  /** Opens the farm afresh after it couldn't load. */
  readonly onRetry: () => void;
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
  const loading = useFarmLoading(state !== null);
  const k = width / 393;
  const send = useSend(farm);
  const { appearance, palette } = useTheme();
  const visible = useArtVisible();
  const reduce = useReduceMotion();
  const [sheet, setSheet] = useState(0);
  const fire = useFireOnFarm(farm);
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
  useMoments(farm, me);
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
          onRetry={onRetry}
        />
      </View>
    );
  }

  // Only you on the farm so far: the sketched cottages wait for friends.
  const alone = state !== null && state.members.length === 1 && state.former.length === 0;
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
            ...(view ? { season: view.season.season } : {}),
            ...(appearance === 'night' ? { night: true } : {}),
          }}
          paused={!visible || sheet !== 0}
        />
      ) : (
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
          now={now}
          fire={fire}
          targets={{
            onCritter: openCritter,
            onHouse: (h) =>
              h.former ? router.push(farmRoutes.cottage(farm, h.person)) : openCritter(h.person),
            onFire: () => openFire(farm),
            onPatch: () => router.navigate(farmRoutes.seedbed()),
            onPlan: (p) => router.push(farmRoutes.plan(farm, p.seed.seq)),
          }}
        />
      )}
      {loading.revealing ? (
        <FarmReveal width={width} height={sceneH} ready={state !== null} onDone={loading.done} />
      ) : null}
      <FarmFog width={width} height={sceneH} on={offline && state !== null} />
      {loading.loading ? <DrawingLabel top={DRAWING_TOP * k} /> : null}
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
                <FireGlowCard farm={farm} />
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
            <RhythmSheetRows farm={farm} state={state} view={view} />
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
  const [attempt, setAttempt] = useState(0);
  useGoneNote(valley.gone, valley.forget);

  if (valley.current) {
    const row = valley.farms.find((f) => f.farm === valley.current);
    return (
      <FarmFor
        key={`${valley.current}:${attempt}`}
        farm={valley.current}
        name={row?.name ?? null}
        onRetry={() => setAttempt((a) => a + 1)}
      />
    );
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
