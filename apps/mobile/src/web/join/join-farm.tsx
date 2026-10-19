import type { Critter } from '@kithfield/contracts';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { bakeBackdrop, bakeCritter, type Backdrop } from '../../features/farm/farm-bake';
import { FarmCanvas, type CanvasCritter } from '../../features/farm/farm-canvas';
import { placeFarm } from '../../features/farm/scene-layout';
import { phaseOf } from '../../features/farm/use-farm-scene';
import { whenIdle } from '../../features/farm/use-now';
import { useArt } from '../../ui/art/art-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { platformLook } from '../look';

/** The newcomer's place in the placement, apart from every resident's. */
export const NEWCOMER = 'newcomer';

/**
 * The farm an invite opens onto, alive: the farm's still, the critters who live there breathing
 * and blinking where the farm stands them, and the cottage saved for the newcomer glowing on a
 * pulse until they move in. The critter they pick stands in the glow, so choosing shows at once.
 */
export function JoinFarm({
  width,
  height,
  residents,
  newcomer,
  season,
  night,
  onGlow,
}: {
  readonly width: number;
  readonly height: number;
  readonly residents: readonly Critter[];
  readonly newcomer: Critter;
  readonly season: string;
  readonly night: boolean;
  /** Where the glow sits, for a label beside it. */
  readonly onGlow?: (at: { x: number; y: number; r: number }) => void;
}) {
  const store = useArt();
  const reduce = useReduceMotion();
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null);

  const placement = useMemo(
    () =>
      placeFarm([
        ...residents.map((c, i) => ({ person: `r${i}`, species: c.species, joinedAt: i })),
        { person: NEWCOMER, species: newcomer.species, joinedAt: residents.length },
      ]),
    [residents, newcomer.species],
  );
  const lit = placement.houses.map((h) => h.key);

  const backdropKey = JSON.stringify({ width, height, season, night, lit, fog: false });
  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    const req = JSON.parse(backdropKey) as Parameters<typeof bakeBackdrop>[1];
    return whenIdle(() => setBackdrop(bakeBackdrop(store, req)));
  }, [store, backdropKey, width, height]);

  const critters = useMemo<CanvasCritter[]>(
    () =>
      width <= 0
        ? []
        : placement.critters.flatMap((p) => {
            const critter = p.person === NEWCOMER ? newcomer : residents[Number(p.person.slice(1))];
            if (!critter) return [];
            const size = width * p.spot.size;
            return [
              {
                person: p.person,
                x: width * p.spot.x,
                y: height * p.spot.y,
                size,
                asleep: false,
                ph: phaseOf(p.person),
                poses: bakeCritter(store, critter, size, p.spot.dir, false),
              },
            ];
          }),
    [store, placement, residents, newcomer, width, height],
  );

  const mine = critters.find((c) => c.person === NEWCOMER);
  const ring = mine ? { x: mine.x, y: mine.y - mine.size * 0.45, r: mine.size * 0.8 } : null;
  useEffect(() => {
    if (ring) onGlow?.(ring);
    // The glow's place follows the critter's spot; `onGlow` is a setter.
  }, [ring?.x, ring?.y, ring?.r]);

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <FarmCanvas
        width={width}
        height={height}
        backdrop={backdrop}
        critters={critters}
        night={night}
        running={!reduce}
        reduce={reduce}
      />
      {ring ? <SavedGlow x={ring.x} y={ring.y} r={ring.r} reduce={reduce} /> : null}
    </View>
  );
}

/** A ring of light round the saved place, breathing on the design's 1.6 s pulse. */
function SavedGlow({
  x,
  y,
  r,
  reduce,
}: {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly reduce: boolean;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      pulse.set(0.5);
      return;
    }
    pulse.set(
      withRepeat(
        withTiming(1, {
          duration: platformLook.savedPulseMs / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );
  }, [pulse, reduce]);
  const glow = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.get() * 0.45,
    transform: [{ scale: 0.97 + pulse.get() * 0.06 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x - r,
          top: y - r,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          borderWidth: 3,
          borderColor: platformLook.glowRing,
          boxShadow: `0 0 40px ${platformLook.glowLight}`,
        },
        glow,
      ]}
    />
  );
}
