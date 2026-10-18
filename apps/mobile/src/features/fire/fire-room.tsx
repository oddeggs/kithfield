import { type FarmId, type LanguageTag, OWN_PACK } from '@kithfield/contracts';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useFarm, useFarmEvents, useOpenFarm, useSend } from '../../data';
import { announcePolitely } from '../../ui/announce';
import { ArtIcon } from '../../ui/art/art-view';
import { lookOf } from '../../ui/art/critter-look';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { useSession } from '../../ui/session/session';
import { useGestureSend } from '../gestures/send';
import { CAPTION_LANGS, CaptionsCard, CaptionsSheet } from './captions';
import { CircleOverlay, FLOAT_MS, type CirclePerson, type Float } from './circle-overlay';
import { useFireApi } from './fire-api';
import { FireHeader, GlassRound, leaveRoom, useHeaderTop, type ChipKind } from './fire-chrome';
import {
  JoinPanel,
  LeavePanel,
  QuietPanel,
  RoomDock,
  UnlitPanel,
  type GestureKind,
} from './fire-dock';
import { FireScene } from './fire-scene';
import { Lanterns, ShareCard, type LanternPerson } from './lanterns';
import { FireTxt } from './fire-text';
import { fireLook } from './look';
import {
  critterFor,
  dockStateOf,
  gestureTarget,
  headerLine,
  layoutOf,
  phaseAfter,
  speakerToAnnounce,
  weakOne,
  type FireMode,
  type FirePerson,
  type Phase,
} from './room-model';
import { DRAWN_SEATS } from './seats';
import { useCast } from './use-cast';
import { memberOf, useFireCircle, useFireRoom } from './use-fire-room';

/*
 * The fire room: light the fire, pull up a log (listening or joined in, muted either way), sit
 * with friends as critters around the fire, light a lantern, read captions, and head home. It
 * never rings anyone; nobody is told who listened or that anyone left; time by the fire grows the
 * farm's Voices once per sitting (`fire {sat}`).
 */

/** Your critter waves three times and walks up the path before the room closes behind you. */
const WALK_HOME_MS = 3900;

const GESTURE_ICON: Readonly<Record<string, string>> = {
  wave: 'wave',
  dewdrop: 'dewdrop',
  hug: 'heart',
};

export function FireRoomScreen({ farm }: { readonly farm: FarmId }) {
  useOpenFarm(farm);
  const { t, language } = useLocale();
  const { width, height } = useWindowDimensions();
  const scale = width / 393;
  const toast = useToast();
  const me = useSession().person?.id ?? null;
  const state = useFarm(farm)?.state ?? null;
  const send = useSend(farm);
  const gesture = useGestureSend(farm);
  const api = useFireApi(farm);
  const headerTop = useHeaderTop();

  const [captionsOk, setCaptionsOk] = useState(false);
  const [perks, setPerks] = useState(false);
  useEffect(() => {
    let live = true;
    api.captionsAllowed().then(
      (ok) => live && setCaptionsOk(ok),
      () => undefined,
    );
    api.perks().then(
      (ok) => live && setPerks(ok),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api]);

  const { session, snap } = useFireRoom(farm, api, captionsOk);
  const circle = useFireCircle(farm);

  // Where you are: the fire out, pulling up a log, sitting, heading home, or the fire settling.
  const [phase, setPhase] = useState<Phase | null>(null);
  const lit = state ? state.fireLitAt !== null : null;
  useEffect(() => {
    if (lit === null) return;
    // Someone else lit it while you were deciding, or it went out while you pulled up a log.
    const next = phaseAfter(phase, lit);
    if (next !== phase) setPhase(next);
  }, [lit, phase]);
  const [busy, setBusy] = useState(false);
  // A sitting that drops for good (not just reconnecting) takes you back to pull up a log again.
  useEffect(() => {
    const gone = snap.status === 'failed' || snap.status === 'closed';
    if (!gone || (phase !== 'room' && phase !== 'leaving')) return;
    setPhase('joining');
    if (snap.status === 'failed') toast.show(t('fire.error.connect'));
  }, [snap.status, phase, toast, t]);

  const nameOf = useCallback(
    (id: string) =>
      id === me ? t('fire.chip.you') : (memberOf(state, id)?.name ?? t('fire.friend')),
    [me, state, t],
  );
  const yourName = memberOf(state, me ?? '')?.name ?? '';
  const yourCritter = memberOf(state, me ?? '')?.critter ?? null;

  // Who is drawn: the room's people once you sit, the farm's word on who is by the fire before.
  const sitting = phase === 'room' || phase === 'leaving';
  const frozen = useRef<readonly FirePerson[]>([]);
  if (sitting && snap.people.length > 0) frozen.current = snap.people;
  const roomPeople: readonly FirePerson[] = sitting
    ? snap.people
    : phase === 'walking'
      ? frozen.current.filter((p) => !p.you)
      : [];
  const before =
    phase === 'joining' ? [...circle.filter((id) => id !== me), ...(me ? [me] : [])] : [];
  const castPeople =
    sitting || phase === 'walking'
      ? roomPeople.map((p) => ({
          id: p.id,
          critter: critterFor(state, p.id),
          speaking: p.speaking && p.mic,
          weak: p.weak,
        }))
      : before.map((id) => ({
          id,
          critter: critterFor(state, id),
          speaking: false,
          weak: false,
        }));
  const walkers = useMemo(() => new Set(phase === 'joining' && me ? [me] : []), [phase, me]);
  const { seating, cast, arriving, onGone } = useCast(
    castPeople,
    phase === null ? null : sitting || phase === 'walking' ? 'room' : 'outside',
    walkers,
  );

  const layout = sitting ? layoutOf(roomPeople) : ({ kind: 'circle' } as const);
  const you = roomPeople.find((p) => p.you) ?? null;
  const dock = dockStateOf(you);

  /* Captions: only you see them, in your language, while your perks are on. */
  const [captionsOn, setCaptionsOn] = useState(false);
  const [lang, setLang] = useState<LanguageTag>(language);
  const [original, setOriginal] = useState(true);
  const [sheet, setSheet] = useState(false);
  const turnCaptions = async (on: boolean) => {
    setCaptionsOn(on);
    await session.setCaptionsIn(on ? lang : null);
  };
  const nextLang = async () => {
    const i = CAPTION_LANGS.indexOf(lang as (typeof CAPTION_LANGS)[number]);
    const to = CAPTION_LANGS[(i + 1) % CAPTION_LANGS.length] ?? 'en';
    setLang(to);
    if (captionsOn) await session.setCaptionsIn(to);
  };
  // A speaker who said no shows as a quiet "…" while they talk.
  const speakingIds = roomPeople
    .filter((p) => p.speaking && !p.you && !p.captionsOk)
    .map((p) => p.id)
    .join();
  useEffect(() => {
    if (!captionsOn || speakingIds === '') return;
    for (const id of speakingIds.split(',')) session.withheld(id);
  }, [captionsOn, speakingIds, session]);

  /* Gestures float over whoever got them, for three seconds. */
  const events = useFarmEvents(farm, 20);
  const [openedAt] = useState(() => Date.now());
  const seenSeq = useRef(0);
  const [floats, setFloats] = useState<readonly Float[]>([]);
  useEffect(() => {
    const fresh = events.filter(
      (e) => e.seq > seenSeq.current && e.at >= openedAt && GESTURE_ICON[e.kind],
    );
    seenSeq.current = Math.max(seenSeq.current, events.at(-1)?.seq ?? 0);
    if (fresh.length === 0) return;
    const added: Float[] = fresh.flatMap((e) => {
      const to = (e.payload as { to?: unknown } | null)?.to;
      if (typeof to !== 'string') return [];
      return [
        { key: `g${e.seq}`, to, icon: GESTURE_ICON[e.kind] ?? 'heart', fromYou: e.actor === me },
      ];
    });
    setFloats((f) => [...f, ...added]);
    const timer = setTimeout(
      () => setFloats((f) => f.filter((x) => !added.some((a) => a.key === x.key))),
      FLOAT_MS + 100,
    );
    return () => clearTimeout(timer);
  }, [events, me, openedAt]);
  // VoiceOver hears who is talking as it changes, politely and not too often.
  const speakingNow = roomPeople.find((p) => p.speaking && p.mic && !p.you)?.id ?? null;
  const announced = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    const now = Date.now();
    const who = speakerToAnnounce(announced.current, speakingNow, now);
    if (who === null) return;
    announced.current = { id: who, at: now };
    announcePolitely(t('fire.chip.talking', { name: nameOf(who) }));
  }, [speakingNow, nameOf, t]);
  const [picked, setPicked] = useState<string | null>(null);
  const target = gestureTarget(roomPeople, picked, snap.lastSpeaker);

  /* What you do */

  const light = async () => {
    setBusy(true);
    const r = await send('fire', { state: 'lit' });
    setBusy(false);
    if (r.status === 'refused') return toast.show(t('fire.error.connect'));
    haptics.soft();
    setPhase('joining');
  };
  const sit = async (mode: FireMode) => {
    setBusy(true);
    const ok = await session.sit(mode);
    setBusy(false);
    if (!ok) return toast.show(t('fire.error.connect'));
    // Time by the fire grows Voices, once a sitting; a second one is simply refused.
    await send('fire', { state: 'sat' });
    setPhase('room');
  };
  const mic = async () => {
    setBusy(true);
    try {
      if (dock === 'listening') await session.joinIn();
      else await session.setMic(dock === 'muted');
    } catch {
      toast.show(t('fire.error.mic'));
    } finally {
      setBusy(false);
    }
  };
  const lantern = async () => {
    try {
      await session.setLantern(!(you?.lantern ?? false));
    } catch {
      toast.show(t('fire.error.camera'));
    }
  };
  const onGesture = async (kind: GestureKind) => {
    if (kind === 'sticker') {
      await gesture('sticker', { pack: OWN_PACK, sticker: 'love' }, { haptic: 'soft' });
      return;
    }
    if (target === null) return;
    await gesture(kind, { to: target }, { haptic: 'soft' });
  };
  const walkHome = async () => {
    const last = roomPeople.filter((p) => !p.you).length === 0;
    setPhase('walking');
    await session.leave();
    setTimeout(() => (last ? setPhase('quiet') : leaveRoom()), WALK_HOME_MS);
  };

  /* Drawing */

  const fireState = phase === 'unlit' ? 'unlit' : phase === 'quiet' ? 'quiet' : 'lit';
  const asking =
    phase === 'unlit' ||
    phase === 'joining' ||
    phase === 'leaving' ||
    phase === 'quiet' ||
    phase === 'walking';
  const line = headerLine(t, {
    phase: phase === 'walking' ? 'leaving' : phase === null ? 'unlit' : phase,
    farmName: state?.name ?? '',
    people:
      phase === 'joining'
        ? before.filter((id) => id !== me).map((id) => personStub(id))
        : roomPeople,
    nameOf,
    layout,
    captionsOn,
    showing: snap.showing,
  });
  const full = roomPeople.length >= DRAWN_SEATS;
  const circlePeople: CirclePerson[] = cast
    .filter((c) => c.moving !== 'leaving')
    .map((c) => {
      const p = roomPeople.find((q) => q.id === c.id);
      const name = nameOf(c.id);
      const chip: ChipKind = !p
        ? 'plain'
        : p.weak
          ? 'paused'
          : p.speaking && p.mic
            ? 'talking'
            : p.mode === 'listen'
              ? 'listening'
              : p.mic
                ? 'plain'
                : 'muted';
      const note =
        chip === 'paused'
          ? t('fire.chip.paused')
          : chip === 'listening' && full && !p?.you
            ? t('fire.chip.justListening')
            : undefined;
      const label =
        chip === 'talking'
          ? t('fire.chip.talking', { name })
          : chip === 'listening'
            ? t('fire.chip.listeningA11y', { name })
            : chip === 'muted'
              ? t('fire.chip.mutedA11y', { name })
              : name;
      return {
        id: c.id,
        name,
        seat: seating[c.id] ?? null,
        chip,
        ...(note ? { note } : {}),
        label,
        level: session.levelOf(c.id),
        arriving: arriving.has(c.id) && c.id !== me,
        you: c.id === me,
      };
    })
    .filter((c) => !(c.you && arriving.has(c.id)));
  const others = roomPeople
    .filter((p) => !p.you)
    .map((p) => {
      const critter = memberOf(state, p.id)?.critter;
      return { id: p.id, kind: critter?.species ?? 'rabbit', look: critter ? lookOf(critter) : {} };
    });
  const lanternPeople: LanternPerson[] = roomPeople.map((p) => ({
    id: p.id,
    name: p.you ? yourName : nameOf(p.id),
    you: p.you,
    critter: critterFor(state, p.id),
    lantern: p.lantern,
    mic: p.mic,
    speaking: p.speaking && p.mic,
    level: session.levelOf(p.id),
  }));
  const weak = weakOne(roomPeople);
  const sharer =
    layout.kind === 'share' ? (session.room.remoteParticipants.get(layout.by) ?? null) : null;
  const compact = layout.kind !== 'circle';

  // Captions show only where they can be had at all; until then there is no CC button.
  const right =
    phase !== 'room' ? undefined : compact ? (
      <GlassRound label={t('fire.dock.share')} onPress={() => toast.show(t('fire.error.share'))}>
        <ArtIcon name="share" size={20} color={fireLook.text} />
      </GlassRound>
    ) : snap.captionsAvailable ? (
      <GlassRound
        label={t('fire.captions.button')}
        fill={captionsOn ? fireLook.text : fireLook.glass}
        onPress={() => (perks ? void turnCaptions(!captionsOn) : setSheet(true))}
        testID="fire-captions"
      >
        <FireTxt
          variant="buttonSmall"
          color={captionsOn ? fireLook.primaryInk : fireLook.text}
          style={{ fontSize: 13, lineHeight: 15, fontWeight: '700', letterSpacing: 0.26 }}
        >
          {t('fire.captions.cc')}
        </FireTxt>
      </GlassRound>
    ) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: fireLook.sky }}>
      <StatusBar style="light" />
      <FireScene
        width={width}
        height={height}
        season={state?.season.season ?? 'spring'}
        fire={fireState}
        alt={asking}
        lifted={asking}
        cast={layout.kind === 'ring' || layout.kind === 'share' ? [] : cast}
        levelOf={(id) => session.levelOf(id)}
        loudest={session.loudest}
        onGone={onGone}
      >
        <CircleOverlay
          width={width}
          height={height}
          people={circlePeople}
          floats={floats}
          {...(phase === 'room' && dock === 'muted' ? { onPick: setPicked } : {})}
          showChips={!compact && phase !== 'quiet' && phase !== 'unlit'}
        />
      </FireScene>
      {phase === 'room' && compact && layout.kind !== 'share' ? (
        <Lanterns
          layout={layout}
          people={lanternPeople}
          room={session.room}
          scale={scale}
          onYourFrame={() => void session.setLook(!snap.showing)}
        />
      ) : null}
      {phase === 'room' && sharer ? <ShareCard participant={sharer} scale={scale} /> : null}
      <FireHeader title={t('fire.title')} line={line} {...(right ? { right } : {})} />
      {phase === 'room' && captionsOn ? (
        <CaptionsCard
          rows={snap.captions}
          lang={lang}
          original={original}
          top={headerTop + 64}
          whoIs={(id) => ({ name: nameOf(id), critter: critterFor(state, id) })}
          onSettings={() => setSheet(true)}
        />
      ) : null}
      {phase === 'unlit' ? (
        <UnlitPanel onLight={() => void light()} onNotTonight={() => leaveRoom()} busy={busy} />
      ) : phase === 'joining' ? (
        <JoinPanel
          you={yourName}
          onJoin={() => void sit('join')}
          onListen={() => void sit('listen')}
          busy={busy}
        />
      ) : phase === 'room' ? (
        <RoomDock
          state={dock}
          compact={compact}
          yourName={yourName}
          yourCritter={yourCritter}
          others={others}
          weak={weak ? nameOf(weak.id) : null}
          gestureTo={target ? nameOf(target) : null}
          lantern={you?.lantern ?? false}
          sharing={layout.kind === 'share' && layout.by === me}
          lookingAway={snap.showing === me}
          busy={busy}
          onMic={() => void mic()}
          onLantern={() => void lantern()}
          onHome={() => setPhase('leaving')}
          onGesture={(k) => void onGesture(k)}
          onStopSharing={() => undefined}
          onFlipBack={() => void session.setLook(false)}
        />
      ) : phase === 'leaving' || phase === 'walking' ? (
        <LeavePanel you={yourName} onWalk={() => void walkHome()} onStay={() => setPhase('room')} />
      ) : phase === 'quiet' ? (
        <QuietPanel onBack={() => leaveRoom()} />
      ) : null}
      <CaptionsSheet
        open={sheet}
        perks={perks}
        on={captionsOn}
        lang={lang}
        original={original}
        onOn={(on) => void turnCaptions(on)}
        onLang={() => void nextLang()}
        onOriginal={setOriginal}
        onPlus={() => toast.show(t('fire.captions.turnOn'))}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

/** Someone the farm says is by the fire, before you've sat down and can see how. */
const personStub = (id: string): FirePerson => ({
  id,
  you: false,
  mode: 'join',
  mic: false,
  speaking: false,
  weak: false,
  lantern: false,
  sharing: false,
  captionsOk: false,
  joinedAt: 0,
});
