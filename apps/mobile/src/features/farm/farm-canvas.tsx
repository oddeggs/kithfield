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
import { STILL_T, type Backdrop, type CloudSprite, type CritterPoses } from './farm-bake';
import { breathOf, isBlinking, tick } from './farm-clock';

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
}: {
  readonly c: CanvasCritter;
  readonly clock: SharedValue<number>;
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
    <Group transform={transform}>
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
}: {
  readonly width: number;
  readonly height: number;
  readonly backdrop: Backdrop | null;
  readonly critters: readonly CanvasCritter[];
  readonly night: boolean;
  readonly running: boolean;
  readonly reduce: boolean;
}) {
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
        {critters.map((c) => (
          <CritterDrawing key={c.person} c={c} clock={clock} />
        ))}
      </Group>
    </Canvas>
  );
}
