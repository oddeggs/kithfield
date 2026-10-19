import { fireLoop, type FrameLoop } from '@kithfield/art';
import type { Critter } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { Canvas, ColorMatrix, Group, Image } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PixelRatio, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useArt, useArtStill, whenIdle } from '../../ui/art/art-provider';
import { fadeTo, sheetTo } from '../../ui/motion/motion';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useArtVisible } from '../../ui/motion/visibility';
import { STILL_T } from '../farm/farm-bake';
import { breathOf, isBlinking, tick } from '../farm/farm-clock';
import {
  backdropRequest,
  bakeSeat,
  FLAME,
  LOOP_BASE,
  LOOP_FLAME,
  seatShade,
  type FireState,
  type SeatPoses,
} from './fire-art';
import { FIRE_AT, PATH_END, PATH_FOOT, PATH_HOME, SLOTS } from './seats';

/*
 * The fire room's scene: the campfire as a still, the fire flickering over it on its own loop, and
 * a critter on each log. Critters walk up the path to their log, breathe and blink, lean in and
 * bob as their person talks, doze on a weak connection, and wave and walk home. Everything moves
 * on the UI thread, on twos, from one clock.
 */

/** A critter by the fire, as the scene draws it. */
export interface SceneCritter {
  readonly id: string;
  readonly critter: Critter;
  readonly seat: number;
  /** Walking up the path, on their log, or waving and walking home. */
  readonly moving: 'arriving' | 'seated' | 'leaving';
  readonly speaking: boolean;
  readonly weak: boolean;
}

/** Walking to a log takes about two seconds (design notes: on twos, then sits). */
const ARRIVE_MS = 2000;
/** Heading home: three swings of a wave, then three seconds up the path. */
const WAVE_MS = 900;
const HOME_MS = 3000;
/** The share of the walk home spent getting to the foot of the path. */
const FOOT_AT = 0.3;
/** Talking leans the critter 2° toward the fire. */
const LEAN = (2 * Math.PI) / 180;
/** The flame settles to embers over four seconds as the last person leaves. */
const SETTLE_MS = 4000;
/** How far the scene rises behind a tall panel. */
export const SCENE_LIFT = 170;
/** Laughter lifts the flame by up to 30%. */
const LIFT = 0.3;

const FRAME_S = motion.twos.frameMs / 1000;
const linear = (duration: number) => ({
  duration,
  easing: Easing.linear,
  reduceMotion: ReduceMotion.Never,
});

/** Steps a 0..1 progress to whole drawings on twos over `ms`. */
function onTwos(p: number, ms: number): number {
  'worklet';
  const steps = Math.max(1, Math.round(ms / 1000 / FRAME_S));
  return Math.floor(p * steps) / steps;
}

function CritterSprite({
  c,
  poses,
  width,
  height,
  clock,
  level,
  reduce,
  onGone,
}: {
  readonly c: SceneCritter;
  readonly poses: SeatPoses;
  readonly width: number;
  readonly height: number;
  readonly clock: SharedValue<number>;
  readonly level: SharedValue<number>;
  /** Passed in: the canvas draws its children outside the app's React context. */
  readonly reduce: boolean;
  readonly onGone: (id: string) => void;
}) {
  const slot = SLOTS[c.seat] ?? SLOTS[0];
  const sx = (slot?.x ?? 0.5) * width;
  const sy = (slot?.y ?? 0.6) * height;
  const dir = slot?.dir ?? 1;
  const ph = (c.seat * 0.23) % 1;
  // 0 → walking up from the path's end, 1 → on the log, 2 → waved, 3 → home.
  const stage = useSharedValue(c.moving === 'arriving' && !reduce ? 0 : 1);
  const lean = useSharedValue(0);
  const shown = useSharedValue(c.moving === 'arriving' && reduce ? 0 : 1);
  const id = c.id;
  useEffect(() => {
    if (c.moving === 'arriving') {
      if (reduce) shown.set(fadeTo(1));
      else stage.set(withTiming(1, linear(ARRIVE_MS)));
    } else if (c.moving === 'leaving') {
      if (reduce) {
        shown.set(fadeTo(0));
        const timer = setTimeout(() => onGone(id), motion.fade.durationMs);
        return () => clearTimeout(timer);
      }
      stage.set(1);
      stage.set(withTiming(2, linear(WAVE_MS)));
      const walk = setTimeout(() => stage.set(withTiming(3, linear(HOME_MS))), WAVE_MS);
      const gone = setTimeout(() => onGone(id), WAVE_MS + HOME_MS);
      return () => {
        clearTimeout(walk);
        clearTimeout(gone);
      };
    } else {
      stage.set(1);
    }
    return undefined;
  }, [c.moving, reduce, stage, shown, onGone, id]);
  useEffect(() => {
    lean.set(fadeTo(c.speaking && !c.weak ? 1 : 0));
  }, [c.speaking, c.weak, lean]);

  const ex = PATH_END.x * width;
  const ey = PATH_END.y * height;
  const hx = PATH_HOME.x * width;
  const hy = PATH_HOME.y * height;
  const footX = PATH_FOOT.x * width;
  const footY = PATH_FOOT.y * height;
  const asleep = c.weak;
  const toward = asleep ? poses.dozing : poses.toward;
  const leftWard = dir === -1 ? poses.toward : poses.away;
  const rightWard = dir === 1 ? poses.toward : poses.away;
  const seated = toward.open;
  const seatedOpen = seated.image;
  const seatedBlink = toward.blink?.image ?? null;
  const inImage = leftWard.open.image;
  const outImage = rightWard.open.image;

  const image = useDerivedValue(() => {
    const s = stage.get();
    if (s < 1) return inImage;
    if (s > 2) return outImage;
    if (seatedBlink !== null && isBlinking(clock.get(), ph)) return seatedBlink;
    return seatedOpen;
  });
  const transform = useDerivedValue(() => {
    const t = clock.get();
    const s = stage.get();
    let x = sx;
    let y = sy;
    let scale = 1;
    let rot = 0;
    if (s < 1) {
      const p = onTwos(s, ARRIVE_MS);
      x = ex + (sx - ex) * p;
      y = ey + (sy - ey) * p - Math.abs(Math.sin(t * 6)) * 3;
    } else if (s <= 2) {
      // The wave: three swings on the log.
      const w = s - 1;
      rot = w > 0 && w < 1 ? Math.sin(onTwos(w, WAVE_MS) * Math.PI * 6) * 0.1 * dir : 0;
      rot += lean.get() * LEAN * dir;
      // Lips: a talking critter bobs with their voice.
      y -= level.get() * Math.abs(Math.sin(t * 10)) * 3;
    } else {
      // To the foot of the path first, then up it, smaller as it goes (`fire2`'s walk home).
      const p = onTwos(s - 2, HOME_MS);
      const hop = Math.abs(Math.sin(t * 6)) * 3;
      if (p < FOOT_AT) {
        const q = p / FOOT_AT;
        x = sx + (footX - sx) * q;
        y = sy + (footY - sy) * q - hop;
        scale = 1 + (0.95 - 1) * q;
      } else {
        const q = (p - FOOT_AT) / (1 - FOOT_AT);
        x = footX + (hx - footX) * q;
        y = footY + (hy - footY) * q - hop;
        scale = 0.95 + (0.55 - 0.95) * q;
      }
    }
    const br = breathOf(t, ph, asleep);
    const talk = s >= 1 && s <= 2 ? level.get() * 0.04 : 0;
    return [
      { translateX: x },
      { translateY: y },
      { rotate: rot },
      { scaleX: scale * (1 - br * 0.5) },
      { scaleY: scale * (1 + br + talk) },
    ];
  });
  const matrix = useMemo(() => seatShade(c.seat, width, height), [c.seat, width, height]);
  return (
    <Group transform={transform} opacity={shown}>
      <Image image={image} x={-seated.ox} y={-seated.oy} width={seated.w} height={seated.h}>
        <ColorMatrix matrix={matrix} />
      </Image>
    </Group>
  );
}

/** The scene's still for a fire state, faded in over the one before it. */
function useStills(width: number, height: number, season: string, fire: FireState, alt: boolean) {
  const still = useArtStill(backdropRequest(width, height, season, fire, alt), STILL_T);
  const [under, setUnder] = useState<typeof still>(null);
  const shown = useRef(still);
  const fade = useSharedValue(1);
  const reduce = useReduceMotion();
  useEffect(() => {
    const before = shown.current;
    shown.current = still;
    if (!still || !before || before === still) return;
    setUnder(before);
    fade.set(0);
    // The glow comes up over 1.2 s when the fire is lit; other changes cross-fade.
    fade.set(reduce ? fadeTo(1) : withTiming(1, linear(fire === 'lit' ? 1200 : 600)));
    const timer = setTimeout(() => setUnder(null), 1300);
    return () => clearTimeout(timer);
  }, [still, fade, fire, reduce]);
  return { still, under, fade };
}

export function FireScene({
  width,
  height,
  season,
  fire,
  alt,
  lifted,
  cast,
  levelOf,
  loudest,
  onGone,
  children,
}: {
  readonly width: number;
  readonly height: number;
  readonly season: string;
  readonly fire: FireState;
  /** The moon drawn low, for while the scene sits lifted. */
  readonly alt: boolean;
  /** The scene sits up behind a tall panel (lighting, pulling up a log, heading home). */
  readonly lifted: boolean;
  readonly cast: readonly SceneCritter[];
  readonly levelOf: (id: string) => SharedValue<number>;
  /** The loudest voice by the fire now, 0 to 1: laughter lifts the flame. */
  readonly loudest: SharedValue<number>;
  readonly onGone: (id: string) => void;
  /** Drawn over the scene and lifted with it: name chips, gestures. */
  readonly children?: ReactNode;
}) {
  const store = useArt();
  const reduce = useReduceMotion();
  const visible = useArtVisible();
  const { still, under, fade } = useStills(width, height, season, fire, alt);

  // One clock on twos for breathing, blinking, walking and the fire.
  const clock = useSharedValue(STILL_T);
  const base = useSharedValue(STILL_T);
  const frame = useFrameCallback((info) => {
    const next = tick(base.get(), info.timeSinceFirstFrame / 1000, clock.get());
    if (next.changed) clock.set(next.t);
  }, false);
  const running = visible && !reduce;
  useEffect(() => {
    if (!running) base.set(clock.get());
    frame.setActive(running);
  }, [frame, running, base, clock]);

  // The fire's own loop, drawn when the JS thread is idle so it never holds up the first frame.
  const size = Math.round((width * FLAME.lit) / LOOP_FLAME);
  const [loop, setLoop] = useState<FrameLoop | null>(null);
  useEffect(() => {
    if (reduce) {
      setLoop(null);
      return;
    }
    return whenIdle(() => setLoop(fireLoop(store.art, size, PixelRatio.get())));
  }, [store, size, reduce]);
  const frames = loop?.frames ?? [];
  const fps = loop?.fps ?? motion.twos.fps;
  const flame = useSharedValue(fire === 'quiet' ? FLAME.quiet / FLAME.lit : fire === 'lit' ? 1 : 0);
  useEffect(() => {
    const to = fire === 'quiet' ? FLAME.quiet / FLAME.lit : fire === 'lit' ? 1 : 0;
    flame.set(reduce ? to : withTiming(to, linear(fire === 'quiet' ? SETTLE_MS : 600)));
  }, [fire, flame, reduce]);
  // Read on twos with everyone's loudness, so the flame rises and falls in drawings.
  const lift = useDerivedValue(() => 1 + Math.max(0, (loudest.get() - 0.35) / 0.65) * LIFT);
  const fireImage = useDerivedValue(() => {
    const n = frames.length;
    if (n === 0) return null;
    return frames[Math.floor((clock.get() - STILL_T) * fps) % n] ?? null;
  });
  const fx = FIRE_AT.x * width;
  const fy = FIRE_AT.y * height;
  const fireTransform = useDerivedValue(() => {
    const k = flame.get() * lift.get();
    return [{ translateX: fx }, { translateY: fy }, { scale: k }];
  });
  const fireOpacity = useDerivedValue(() => Math.min(1, flame.get() * 4));

  // Each critter's poses, baked once per critter and seat.
  // Baked again only when someone sits on a different log or changes how they look, never as
  // they talk or doze (those are transforms and image swaps of what's here).
  const castKey = cast.map((c) => `${c.id}:${c.seat}:${JSON.stringify(c.critter)}`).join('|');
  const critters = useRef(cast);
  critters.current = cast;
  const poses = useMemo(() => {
    const out = new Map<string, SeatPoses>();
    for (const c of critters.current)
      out.set(`${c.id}:${c.seat}`, bakeSeat(store, c.critter, c.seat, width));
    return out;
    // `castKey` names everything the poses are made from.
  }, [store, castKey, width]);

  // Lifted behind a tall panel, the scene rises with the panel's own spring.
  const rise = useSharedValue(lifted ? 1 : 0);
  useEffect(() => {
    rise.set(sheetTo(lifted ? 1 : 0, reduce));
  }, [lifted, rise, reduce]);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -SCENE_LIFT * rise.get() }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, width, height, overflow: 'hidden' }}
    >
      <Animated.View pointerEvents="box-none" style={[{ width, height }, liftStyle]}>
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <Canvas style={{ width, height }}>
            {under ? <Image image={under} x={0} y={0} width={width} height={height} /> : null}
            <Group opacity={fade}>
              <Image image={still} x={0} y={0} width={width} height={height} />
            </Group>
            {cast.map((c) => {
              const p = poses.get(`${c.id}:${c.seat}`);
              return p ? (
                <CritterSprite
                  key={c.id}
                  c={c}
                  poses={p}
                  width={width}
                  height={height}
                  clock={clock}
                  level={levelOf(c.id)}
                  reduce={reduce}
                  onGone={onGone}
                />
              ) : null;
            })}
            {loop && fire !== 'unlit' ? (
              <Group transform={fireTransform} opacity={fireOpacity}>
                <Image
                  image={fireImage}
                  x={-size / 2}
                  y={-size * LOOP_BASE}
                  width={size}
                  height={size}
                />
              </Group>
            ) : null}
          </Canvas>
        </View>
        {children}
      </Animated.View>
    </View>
  );
}
