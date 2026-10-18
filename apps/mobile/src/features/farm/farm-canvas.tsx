import { Canvas, ColorMatrix, Group, Image, Oval, Paint } from '@shopify/react-native-skia';
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

/** Season changes cross-fade the whole scene (`04 Farm and Chat`, developer notes). */
const SEASON_FADE_MS = 1200;

/**
 * The art's night pass (`night()` in the renderer): a multiply of #1b1f3d at 0.82 over the scene.
 * The still has it already; the critters drawn over it take the same darkening as a colour matrix.
 */
const NIGHT_K = 0.82;
const nightScale = (c: number) => 1 - NIGHT_K * (1 - c / 255);
const NIGHT = [
  nightScale(0x1b),
  0,
  0,
  0,
  0,
  0,
  nightScale(0x1f),
  0,
  0,
  0,
  0,
  0,
  nightScale(0x3d),
  0,
  0,
  0,
  0,
  0,
  1,
  0,
];

/** The scene's breathing and blinking (`critter()` and `blinkAt()` in the renderer), per frame. */
function CritterDrawing({
  c,
  clock,
}: {
  readonly c: CanvasCritter;
  readonly clock: SharedValue<number>;
}) {
  const transform = useDerivedValue(() => {
    const t = clock.get();
    const br = c.asleep
      ? Math.sin((t / 4.4) * 2 * Math.PI + c.ph * 6) * 0.028
      : Math.sin((t / 3.1) * 2 * Math.PI + c.ph * 6) * 0.015;
    return [{ translateX: c.x }, { translateY: c.y }, { scaleX: 1 - br * 0.5 }, { scaleY: 1 + br }];
  });
  const blinking = useDerivedValue(() => {
    if (c.asleep) return 0;
    const period = 3.4 + c.ph * 2.1;
    return (clock.get() + c.ph * 7) % period < 0.13 ? 1 : 0;
  });
  const open = useDerivedValue(() => 1 - blinking.get());
  return (
    <Group transform={transform}>
      {c.poses.sleep.map((l) => (
        <Image key={l.key} image={l.image} x={l.x} y={l.y} width={l.w} height={l.h} />
      ))}
      {c.poses.open.map((l) => (
        <Image
          key={l.key}
          image={l.image}
          x={l.x}
          y={l.y}
          width={l.w}
          height={l.h}
          opacity={open}
        />
      ))}
      {c.poses.blink.map((l) => (
        <Image
          key={l.key}
          image={l.image}
          x={l.x}
          y={l.y}
          width={l.w}
          height={l.h}
          opacity={blinking}
        />
      ))}
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
  const x = useDerivedValue(
    () => ((width * cloud.x0 + clock.get() * cloud.speed) % (width + 160)) - 80 - cloud.ox,
  );
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
 * all moved on the UI thread from one clock. The clock runs only while `running` (the farm is
 * the screen showing, the app is in front, and Reduce Motion is off).
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
  const frame = useFrameCallback((info) => {
    clock.set(STILL_T + info.timeSinceFirstFrame / 1000);
  }, false);
  useEffect(() => {
    frame.setActive(running);
  }, [frame, running]);

  // The backdrop before a change stays underneath while the new one fades in over it.
  const [under, setUnder] = useState<Backdrop | null>(null);
  const shown = useRef<Backdrop | null>(backdrop);
  const fade = useSharedValue(1);
  useEffect(() => {
    const before = shown.current;
    shown.current = backdrop;
    if (!backdrop || !before || before.key === backdrop.key) return;
    setUnder(before);
    fade.set(0);
    fade.set(
      reduce
        ? fadeTo(1)
        : withTiming(1, {
            duration: SEASON_FADE_MS,
            easing: Easing.inOut(Easing.quad),
            reduceMotion: ReduceMotion.Never,
          }),
    );
    const timer = setTimeout(() => setUnder(null), SEASON_FADE_MS + 50);
    return () => clearTimeout(timer);
  }, [backdrop, fade, reduce]);

  const tint = night ? (
    <Paint>
      <ColorMatrix matrix={NIGHT} />
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
          // The scene's own soft shadow under each critter (`critter()` in the renderer).
          <Oval
            key={`shadow:${c.person}`}
            x={c.x - c.size * 0.36}
            y={c.y - c.size * 0.01 - c.size * 0.065}
            width={c.size * 0.72}
            height={c.size * 0.13}
            color="rgba(55,40,25,0.16)"
          />
        ))}
        {critters.map((c) => (
          <CritterDrawing key={c.person} c={c} clock={clock} />
        ))}
      </Group>
    </Canvas>
  );
}
