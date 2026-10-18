import { Circle, Group, Image, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect } from 'react';
import type { View } from 'react-native';
import {
  runOnUI,
  useDerivedValue,
  useFrameCallback,
  type AnimatedRef,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  stepFlight,
  startFlight,
  type AnchorFace,
  type FlightNews,
  type FlightPlan,
  type FlightValues,
} from './flight';
import { landingCentre, poseAt } from './pose';
import type { Sprite } from './sprite';

/** One drawing of a sprite, its top left at 0, 0, shown while it is the current drawing. */
function Drawing({
  sprite,
  index,
  current,
}: {
  readonly sprite: Sprite;
  readonly index: number;
  readonly current: SharedValue<number>;
}) {
  const opacity = useDerivedValue(() => (current.get() === index ? 1 : 0));
  const layers = sprite.drawings[index] ?? [];
  const r = sprite.width / 2;
  const content = layers.map((l, i) =>
    l.image ? <Image key={i} image={l.image} x={l.x} y={l.y} width={l.w} height={l.h} /> : null,
  );
  if (!sprite.disc) return <Group opacity={opacity}>{content}</Group>;
  return (
    <Group
      opacity={opacity}
      clip={Skia.RRectXY(Skia.XYWHRect(0, 0, sprite.width, sprite.height), r, r)}
    >
      <Circle cx={r} cy={sprite.height / 2} r={r} color={sprite.disc} />
      {content}
    </Group>
  );
}

function SpriteDrawings({
  sprite,
  current,
}: {
  readonly sprite: Sprite;
  readonly current: SharedValue<number>;
}) {
  const cx = sprite.width / 2;
  const cy = sprite.height / 2;
  return (
    <>
      {sprite.halo ? (
        <Circle cx={cx} cy={cy} r={sprite.width}>
          <RadialGradient c={vec(cx, cy)} r={sprite.width} colors={[sprite.halo, 'transparent']} />
        </Circle>
      ) : null}
      {sprite.drawings.map((_, i) => (
        <Drawing key={i} sprite={sprite} index={i} current={current} />
      ))}
    </>
  );
}

export interface FlightViewProps {
  readonly values: FlightValues;
  readonly plan: FlightPlan;
  readonly sprite: Sprite;
  /** What it becomes on landing, drawn still on the target. */
  readonly becomes: Sprite | null;
  readonly toRef: AnimatedRef<View> | null;
  /** The target's own drawing, hidden while this flies to it. */
  readonly to: AnchorFace | null;
  readonly drive: DerivedValue<number> | null;
  readonly onDone: (how: FlightNews) => void;
}

/**
 * A flight drawn in the overlay's canvas: the sprite moved by transforms on the UI thread, its
 * drawings swapping on twos, and what it becomes fading in on the target.
 */
export function FlightView({
  values,
  plan,
  sprite,
  becomes,
  toRef,
  to,
  drive,
  onDone,
}: FlightViewProps) {
  const morph = becomes !== null;
  const count = sprite.drawings.length;

  useEffect(() => {
    runOnUI(() => {
      'worklet';
      // Sent back before it left, or nothing to leave from: it ends before it shows.
      if (startFlight(values, plan, to) !== 'flying') scheduleOnRN(onDone, 'returned');
    })();
    // A flight starts once, when it mounts.
  }, []);

  const ends = {
    toRef,
    to,
    drive,
    spriteWidth: plan.spriteWidth,
    fit: plan.fit,
    toWidth: plan.toWidth,
    outMs: plan.outMs,
  };
  const step = useCallback(
    (info: { timeSincePreviousFrame: number | null }) => {
      'worklet';
      stepFlight(values, info.timeSincePreviousFrame ?? 0, ends, onDone);
    },
    // The target's ref arrives late when its screen is still opening, or changes on a retarget.
    [toRef, to, drive],
  );
  useFrameCallback(step);

  const pose = useDerivedValue(() =>
    poseAt(values.geom.get(), values.p.get(), values.clock.get(), morph, count),
  );
  const transform = useDerivedValue(() => {
    const s = pose.get();
    return [
      { translateX: s.x },
      // Squashed on landing, it stays on its feet.
      { translateY: s.y + (sprite.height * (s.base - s.sy)) / 2 },
      { rotate: (s.rotate * Math.PI) / 180 },
      { scaleX: s.sx },
      { scaleY: s.sy },
      { translateX: -sprite.width / 2 },
      { translateY: -sprite.height / 2 },
    ];
  });
  const opacity = useDerivedValue(() => pose.get().opacity);
  const drawing = useDerivedValue(() => pose.get().drawing);

  const landWidth = becomes?.width ?? 1;
  const landHeight = becomes?.height ?? 1;
  const landing = useDerivedValue(() => {
    const g = values.geom.get();
    const c = landingCentre(g);
    const s = (g.toBox?.width ?? landWidth) / landWidth;
    const { landSx, landSy } = pose.get();
    return [
      { translateX: c.x },
      { translateY: c.y + (landHeight * s * (1 - landSy)) / 2 },
      { scaleX: s * landSx },
      { scaleY: s * landSy },
      { translateX: -landWidth / 2 },
      { translateY: -landHeight / 2 },
    ];
  });
  const landOpacity = useDerivedValue(() => pose.get().becomes);
  const still = useDerivedValue(() => 0);

  return (
    <>
      {becomes ? (
        <Group transform={landing} opacity={landOpacity}>
          <SpriteDrawings sprite={becomes} current={still} />
        </Group>
      ) : null}
      <Group transform={transform} opacity={opacity}>
        <SpriteDrawings sprite={sprite} current={drawing} />
      </Group>
    </>
  );
}
