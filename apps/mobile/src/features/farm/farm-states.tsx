import { motion } from '@kithfield/theme';
import { Canvas, Group, Path, RadialGradient, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { FarmLink } from '../../data';
import { announcePolitely } from '../../ui/announce';
import { ArtStill } from '../../ui/art/art-view';
import { ErrorState } from '../../ui/components/state-shell';
import { useLocale } from '../../ui/locale/locale-provider';
import { easings, fadeTo } from '../../ui/motion/motion';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';

/** A farm that arrives sooner than this shows no loader at all (`12 States`, loading). */
export const LOADER_AFTER_MS = 300;
/** The fog lifts over this long when the signal comes back (`12 States`, offline). */
const FOG_LIFT_MS = 1500;

/**
 * Whether the farm is drawing itself in: nothing of it on the phone for longer than the loader's
 * wait, then until the reveal says it is done. A farm already on the phone never shows a loader.
 */
export function useFarmLoading(ready: boolean): {
  readonly revealing: boolean;
  readonly loading: boolean;
  readonly done: () => void;
} {
  const [phase, setPhase] = useState<'wait' | 'reveal' | 'done'>(ready ? 'done' : 'wait');
  useEffect(() => {
    if (phase !== 'wait') return;
    if (ready) {
      setPhase('done');
      return;
    }
    const timer = setTimeout(() => setPhase('reveal'), LOADER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [ready, phase]);
  const done = useCallback(() => setPhase('done'), []);
  return { revealing: phase === 'reveal', loading: !ready && phase === 'reveal', done };
}

/**
 * The renderer's `hash`: the reveal's wobble comes from the same numbers the design draws with.
 */
function hash(i: number, s: number): number {
  'worklet';
  let h = (Math.imul(i | 0, 374761393) + Math.imul((s | 0) + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const WOBBLE = Array.from({ length: 28 }, (_, k) => 1 + (hash(k, 77) - 0.5) * 0.25);

/**
 * The farm drawing itself in (`12 States`, loading): paper while the farm is on its way, then a
 * wobbly blob with a pencil edge growing from the farm's centre over the reveal's 4.2 seconds (the
 * renderer's `revealMask`). With Reduce Motion the paper cross-fades away once the farm is in.
 * Calls `onDone` when the farm shows in full.
 */
export function FarmReveal({
  width,
  height,
  ready,
  onDone,
}: {
  readonly width: number;
  readonly height: number;
  /** The farm is on the phone: the reveal may finish. */
  readonly ready: boolean;
  readonly onDone: () => void;
}) {
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);
  const cover = useSharedValue(1);
  const done = useRef(onDone);
  done.current = onDone;
  const [grown, setGrown] = useState(false);

  // The blob grows once there is a farm to show under it.
  useEffect(() => {
    if (reduce || !ready) return;
    progress.set(
      withTiming(1, {
        duration: motion.reveal.durationMs,
        easing: easings.reveal,
        reduceMotion: ReduceMotion.Never,
      }),
    );
    const timer = setTimeout(() => setGrown(true), motion.reveal.durationMs);
    return () => clearTimeout(timer);
  }, [reduce, ready, progress]);

  // The farm is in and the blob has covered it (or, with Reduce Motion, at once): the paper goes.
  useEffect(() => {
    if (!ready || (!reduce && !grown)) return;
    const timer = setTimeout(() => done.current(), motion.fade.durationMs);
    cover.set(fadeTo(0));
    return () => clearTimeout(timer);
  }, [ready, reduce, grown, cover]);

  const blob = useDerivedValue(() => {
    const p = progress.get();
    const radius = Math.hypot(width, height) * 0.62 * p;
    const cx = width * 0.5;
    const cy = height * 0.62;
    const n = WOBBLE.length;
    const at = (i: number): [number, number] => {
      const k = i % n;
      const a = (k / n) * Math.PI * 2;
      const r = radius * (WOBBLE[k] ?? 1);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9];
    };
    const mid = (i: number): [number, number] => {
      const [ax, ay] = at(i);
      const [bx, by] = at(i + 1);
      return [(ax + bx) / 2, (ay + by) / 2];
    };
    // Smoothed through the midpoints, as the renderer's `toPath` draws a closed wobbly line.
    const b = Skia.PathBuilder.Make();
    const [sx, sy] = mid(0);
    b.moveTo(sx, sy);
    for (let i = 1; i <= n; i++) {
      const [px, py] = at(i);
      const [mx, my] = mid(i);
      b.quadTo(px, py, mx, my);
    }
    b.close();
    return b.build();
  });
  const edge = useDerivedValue(() => (progress.get() > 0.002 && progress.get() < 1 ? 0.55 : 0));
  const style = useAnimatedStyle(() => ({ opacity: cover.get() }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width, height }, style]}
    >
      <Canvas style={{ width, height }}>
        <Group clip={blob} invertClip>
          <Rect x={0} y={0} width={width} height={height} color={palette.background} />
        </Group>
        <Path path={blob} style="stroke" strokeWidth={1.2} color={palette.text} opacity={edge} />
      </Canvas>
    </Animated.View>
  );
}

/** "drawing the farm…" in the hand face over the farm while it loads. */
export function DrawingLabel({ top }: { readonly top: number }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('states.farm.loading')}
      style={{ position: 'absolute', left: 0, right: 0, top, alignItems: 'center' }}
    >
      <Txt variant="handL" color={palette.secondary} align="center">
        {t('states.farm.drawing')}
      </Txt>
    </View>
  );
}

/** One pencil-dashed bar: the design's 6-on, 3-off dashes at a tenth of ink. */
function DashBar({ width }: { readonly width: `${number}%` }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        width,
        height: 12,
        borderRadius: 6,
        overflow: 'hidden',
        flexDirection: 'row',
        gap: 3,
        opacity: 0.8,
      }}
    >
      {Array.from({ length: 40 }, (_, i) => (
        <View key={i} style={{ width: 6, height: 12, backgroundColor: palette.fillSecondary }} />
      ))}
    </View>
  );
}

/** A row of the sheet still to be drawn: a dashed outline beside two dashed lines. */
function PencilRow({
  box,
  lines,
}: {
  readonly box: { width: number; height: number; radius: number };
  readonly lines: readonly [`${number}%`, `${number}%`];
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View
        style={{
          width: box.width,
          height: box.height,
          borderRadius: box.radius,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: palette.grabber,
        }}
      />
      <View style={{ flex: 1, gap: 8 }}>
        <DashBar width={lines[0]} />
        <DashBar width={lines[1]} />
      </View>
    </View>
  );
}

/** The sheet while the farm loads: pencil-dashed outlines, never grey shimmer. */
export function PencilRows() {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 12 }} importantForAccessibility="no-hide-descendants">
      <PencilRow box={{ width: 76, height: 30, radius: 15 }} lines={['90%', '60%']} />
      <View style={{ height: 1, backgroundColor: palette.hairline }} />
      <PencilRow box={{ width: 46, height: 46, radius: 14 }} lines={['70%', '45%']} />
    </View>
  );
}

/**
 * Whether the farm is in a fog: no signal since the socket last dropped. A reconnect attempt
 * (`connecting`) keeps the fog; only a live link lifts it.
 */
export function useOffline(link: FarmLink): boolean {
  const { t } = useLocale();
  const [offline, setOffline] = useState(link.status === 'offline');
  const was = useRef(offline);
  useEffect(() => {
    if (link.status === 'offline') {
      was.current = true;
      setOffline(true);
    } else if (link.status === 'live' || link.status === 'catching_up') {
      // Said once as the fog lifts, after whatever VoiceOver is reading.
      if (was.current) announcePolitely(t('states.offline.back'));
      was.current = false;
      setOffline(false);
    }
  }, [link.status, t]);
  return offline;
}

/** The fog's paper white, as the renderer's `mist` mixes it; a dusk blue at night. */
const FOG = { day: '240,241,238', night: '58,62,96' } as const;
const WASH = { day: 'rgba(236,236,232,.38)', night: 'rgba(36,40,72,.38)' } as const;

/** One drifting bank of the fog: the renderer's `mist`, bank `i` of four, at scene time `t`. */
function Bank({
  i,
  width,
  height,
  clock,
  rgb,
}: {
  readonly i: number;
  readonly width: number;
  readonly height: number;
  readonly clock: { get: () => number };
  readonly rgb: string;
}) {
  const y = height * (0.35 + i * 0.16);
  const r = width * 0.7;
  const centre = useDerivedValue(() => {
    const x = ((clock.get() * (6 + i * 2) + i * 140) % (width + 300)) - 150;
    return vec(x, y);
  });
  return (
    <Rect x={0} y={0} width={width} height={height} opacity={0.55}>
      <RadialGradient c={centre} r={r} colors={[`rgba(${rgb},.95)`, `rgba(${rgb},0)`]} />
    </Rect>
  );
}

/**
 * The farm in a fog (`12 States`, offline): four banks of mist drifting 6 to 12 points a second over
 * a pale wash, as the renderer draws `fog`. It lifts over 1.5 seconds when the signal comes back.
 * With Reduce Motion the mist holds still.
 */
export function FarmFog({
  width,
  height,
  on,
}: {
  readonly width: number;
  readonly height: number;
  readonly on: boolean;
}) {
  const { appearance } = useTheme();
  const reduce = useReduceMotion();
  const clock = useSharedValue(4);
  const shown = useSharedValue(on ? 1 : 0);
  const [mounted, setMounted] = useState(on);
  const frame = useFrameCallback((info) => {
    clock.set(4 + info.timeSinceFirstFrame / 1000);
  }, false);
  useEffect(() => {
    frame.setActive(on && !reduce);
  }, [frame, on, reduce]);
  useEffect(() => {
    if (on) setMounted(true);
    shown.set(
      on
        ? fadeTo(1)
        : withTiming(0, {
            duration: reduce ? motion.fade.durationMs : FOG_LIFT_MS,
            easing: Easing.inOut(Easing.quad),
            reduceMotion: ReduceMotion.Never,
          }),
    );
    if (on) return;
    const timer = setTimeout(() => setMounted(false), FOG_LIFT_MS);
    return () => clearTimeout(timer);
  }, [on, reduce, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get() }));
  if (!mounted) return null;
  const rgb = appearance === 'night' ? FOG.night : FOG.day;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width, height }, style]}
    >
      <Canvas style={{ width, height }}>
        {[0, 1, 2, 3].map((i) => (
          <Bank key={i} i={i} width={width} height={height} clock={clock} rgb={rgb} />
        ))}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          color={appearance === 'night' ? WASH.night : WASH.day}
        />
      </Canvas>
    </Animated.View>
  );
}

/**
 * The farm couldn't load and nothing of it is on the phone (`12 States`, error): the duck under its
 * rain cloud, what is still safe, a small code for support, and a way to try again.
 */
export function FarmLoadFailed({
  code,
  onRetry,
}: {
  /** Shown small for support when the farm answered with a reason. */
  readonly code?: string;
  readonly onRetry: () => void;
}) {
  const { t } = useLocale();
  return (
    <ErrorState
      art={<ArtStill scene="spot" width={360} height={260} attrs={{ name: 'error' }} />}
      title={t('states.error.title')}
      body={t('states.error.body')}
      {...(code ? { code } : {})}
      action={{ label: t('states.error.action'), onPress: onRetry }}
    />
  );
}
