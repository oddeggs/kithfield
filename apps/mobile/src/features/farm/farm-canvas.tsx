import { farm, nightMatrix } from '@kithfield/theme';
import { Canvas, ColorMatrix, Group, Image, Paint } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import {
  Easing,
  ReduceMotion,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { fadeTo } from '../../ui/motion/motion';
import { travelIds, useTravelShownAll } from '../../ui/travel';
import { STILL_T, type Backdrop, type CloudSprite, type CritterPoses } from './farm-bake';
import { breathOf, isBlinking, tick } from './farm-clock';
import type { FarmFire } from './farm-fire';

/** A critter as the canvas draws it: where its feet are, and its cached poses. */
export interface CanvasCritter {
  readonly person: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly asleep: boolean;
  /** Its phase, so the farm never breathes in step. */
  readonly ph: number;
  readonly poses: CritterPoses;
}

const fadeOf = (to: number, reduce: boolean) =>
  reduce
    ? fadeTo(to)
    : withTiming(to, {
        duration: farm.seasonFade.durationMs,
        easing: Easing.bezier(...farm.seasonFade.bezier),
        reduceMotion: ReduceMotion.Never,
      });

/**
 * The scene's breathing and blinking (`critter()` and `blinkAt()` in the renderer). Its worklets
 * read only numbers and the two pose images, and one image switches between eyes open and a blink.
 */
function CritterDrawing({
  c,
  clock,
  shown,
}: {
  readonly c: CanvasCritter;
  readonly clock: SharedValue<number>;
  /** 0 while a copy of this critter travels to or from it. */
  readonly shown: SharedValue<number> | undefined;
}) {
  const { x, y, ph, asleep } = c;
  const open = c.poses.open;
  const openImage = open.image;
  const blinkImage = c.poses.blink?.image ?? null;
  const transform = useDerivedValue(() => {
    const br = breathOf(clock.get(), ph, asleep);
    return [{ translateX: x }, { translateY: y }, { scaleX: 1 - br * 0.5 }, { scaleY: 1 + br }];
  });
  const image = useDerivedValue(() => {
    if (blinkImage === null) return openImage;
    return isBlinking(clock.get(), ph) ? blinkImage : openImage;
  });
  return (
    <Group transform={transform} {...(shown ? { opacity: shown } : {})}>
      <Image image={image} x={-open.ox} y={-open.oy} width={open.w} height={open.h} />
    </Group>
  );
}

/** A cloud drifting across the sky as the scene moves it: 2 to 3 points a second, wrapping. */
function CloudDrawing({
  cloud,
  width,
  height,
  clock,
}: {
  readonly cloud: CloudSprite;
  readonly width: number;
  readonly height: number;
  readonly clock: SharedValue<number>;
}) {
  const { x0, speed, ox } = cloud;
  const x = useDerivedValue(() => ((width * x0 + clock.get() * speed) % (width + 160)) - 80 - ox);
  return (
    <Image
      image={cloud.image}
      x={x}
      y={height * cloud.y - cloud.oy}
      width={cloud.w}
      height={cloud.h}
    />
  );
}

const glowOf = (to: number, reduce: boolean) =>
  reduce
    ? fadeTo(to)
    : withTiming(to, {
        duration: farm.fireGlow.durationMs,
        easing: Easing.bezier(...farm.fireGlow.bezier),
        reduceMotion: ReduceMotion.Never,
      });

/**
 * The fire lit by the ring: its glow and its flame on twos, from the farm's clock. It fades in as
 * the fire is lit and out as it goes out; the last fire stays drawn while it fades.
 */
function FireDrawing({
  fire,
  clock,
  reduce,
}: {
  readonly fire: FarmFire | null;
  readonly clock: SharedValue<number>;
  readonly reduce: boolean;
}) {
  const [held, setHeld] = useState<FarmFire | null>(fire);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (fire) {
      setHeld(fire);
      opacity.set(glowOf(1, reduce));
      return;
    }
    opacity.set(glowOf(0, reduce));
    const timer = setTimeout(() => setHeld(null), farm.fireGlow.durationMs + 50);
    return () => clearTimeout(timer);
  }, [fire, opacity, reduce]);
  const frames = held?.flame.frames ?? [];
  const fps = held?.flame.fps ?? 12;
  const flame = useDerivedValue(() => {
    const n = frames.length;
    return n === 0 ? null : (frames[Math.floor(clock.get() * fps) % n] ?? null);
  });
  if (!held) return null;
  const { glow, flame: box } = held;
  return (
    <Group opacity={opacity}>
      <Image
        image={glow.image}
        x={glow.x}
        y={glow.y}
        width={glow.size}
        height={glow.size}
        // The art lightens the farm with its firelight at night and lays it over by day.
        blendMode={held.night ? 'screen' : 'srcOver'}
      />
      <Image image={flame} x={box.x} y={box.y} width={box.w} height={box.h} />
    </Group>
  );
}

function BackdropDrawing({
  backdrop,
  width,
  height,
  clock,
  opacity,
}: {
  readonly backdrop: Backdrop;
  readonly width: number;
  readonly height: number;
  readonly clock: SharedValue<number>;
  readonly opacity?: SharedValue<number>;
}) {
  return (
    <Group {...(opacity ? { opacity } : {})}>
      <Image image={backdrop.image} x={0} y={0} width={width} height={height} />
      {backdrop.clouds.map((cl, i) => (
        <CloudDrawing key={i} cloud={cl} width={width} height={height} clock={clock} />
      ))}
    </Group>
  );
}

/**
 * The live farm: the cached still, clouds drifting, and every critter breathing and blinking,
 * all moved on the UI thread from one clock on twos. The clock runs only while `running` (the farm
 * is the screen showing, the app is in front, and Reduce Motion is off), and carries on from where
 * it stopped, so coming back never resets the clouds or the breathing.
 */
export function FarmCanvas({
  width,
  height,
  backdrop,
  critters,
  night,
  running,
  reduce,
  fire = null,
  travel,
}: {
  readonly width: number;
  readonly height: number;
  readonly backdrop: Backdrop | null;
  readonly critters: readonly CanvasCritter[];
  readonly night: boolean;
  readonly running: boolean;
  readonly reduce: boolean;
  /** The fire, while it is lit; drawn over the farm as the art draws it. */
  readonly fire?: FarmFire | null;
  /** The farm, so a critter travelling here from a chat can stand in for its drawing. */
  readonly travel?: string;
}) {
  const travelling = useTravelShownAll(
    travel === undefined ? [] : critters.map((c) => travelIds.farmCritter(travel, c.person)),
  );
  const clock = useSharedValue(STILL_T);
  const base = useSharedValue(STILL_T);
  const frame = useFrameCallback((info) => {
    const next = tick(base.get(), info.timeSinceFirstFrame / 1000, clock.get());
    if (next.changed) clock.set(next.t);
  }, false);
  useEffect(() => {
    if (!running) base.set(clock.get());
    frame.setActive(running);
  }, [frame, running, base, clock]);

  // The backdrop before a change stays underneath while the new one fades in over it; the
  // critters' night darkening fades with it.
  const [under, setUnder] = useState<Backdrop | null>(null);
  const shown = useRef<Backdrop | null>(backdrop);
  const fade = useSharedValue(1);
  const dark = useSharedValue(night ? 1 : 0);
  const [tinting, setTinting] = useState(night);
  useEffect(() => {
    const before = shown.current;
    shown.current = backdrop;
    if (!backdrop) return;
    dark.set(fadeOf(night ? 1 : 0, reduce));
    if (night) setTinting(true);
    const timer = setTimeout(() => {
      setUnder(null);
      if (!night) setTinting(false);
    }, farm.seasonFade.durationMs + 50);
    if (before && before.key !== backdrop.key) {
      setUnder(before);
      fade.set(0);
      fade.set(fadeOf(1, reduce));
    }
    return () => clearTimeout(timer);
  }, [backdrop, night, fade, dark, reduce]);
  const matrix = useDerivedValue(() => nightMatrix(dark.get()));

  const tint = tinting ? (
    <Paint>
      <ColorMatrix matrix={matrix} />
    </Paint>
  ) : undefined;

  return (
    <Canvas style={{ width, height }}>
      {under ? (
        <BackdropDrawing backdrop={under} width={width} height={height} clock={clock} />
      ) : null}
      {backdrop ? (
        <BackdropDrawing
          backdrop={backdrop}
          width={width}
          height={height}
          clock={clock}
          opacity={fade}
        />
      ) : null}
      <Group {...(tint ? { layer: tint } : {})}>
        {critters.map((c, i) => (
          <CritterDrawing key={c.person} c={c} clock={clock} shown={travelling[i]} />
        ))}
      </Group>
      <FireDrawing fire={fire} clock={clock} reduce={reduce} />
    </Canvas>
  );
}
