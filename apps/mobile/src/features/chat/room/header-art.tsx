import { critterLayers, type CritterLook } from '@kithfield/art';
import type { Critter } from '@kithfield/contracts';
import { motion, travel } from '@kithfield/theme';
import { Canvas, Group, Image } from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ArtStill } from '../../../ui/art/art-view';
import { TravelSpot, useTravelShownAll } from '../../../ui/travel';
import { useArt, useArtStill } from '../../../ui/art/art-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { lookOf } from '../model/people';

/** A critter on the header: who, how they look and whether they're dozing. */
export interface HeaderCritter {
  readonly person: string;
  readonly critter: Critter;
  readonly sleeping: boolean;
}

interface Placed {
  readonly kind: string;
  readonly look: CritterLook;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly dir: 1 | -1;
  readonly sleeping: boolean;
}

/** Where the strip scene stands its five critters (`kithfield-art.js`, `S.strip`). */
const STRIP_SLOTS = [0.22, 0.37, 0.51, 0.66, 0.82] as const;
const STRIP_PICK: Readonly<Record<number, readonly number[]>> = {
  1: [2],
  2: [1, 3],
  3: [1, 2, 3],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
};
const STRIP_SCALE: Readonly<Record<string, number>> = { sheep: 1.1, frog: 0.95, hedgehog: 1.05 };
const STRIP_DIRS = [1, 1, -1, -1, 1] as const;
const POS: 1 | -1 = 1;
const NEG: 1 | -1 = -1;

/**
 * The farm's critters where the design's scenes stand them: up to five as the strip does, more in
 * two rows as the crowd scene does (`S.crowd`), back row first.
 */
export function placeCritters(critters: readonly HeaderCritter[], w: number, h: number): Placed[] {
  const n = critters.length;
  if (n <= 5) {
    const slots = STRIP_PICK[n] ?? [];
    return critters.map((c, i) => {
      const slot = slots[i] ?? 2;
      const kind = c.critter.species;
      return {
        kind,
        look: lookOf(c.critter),
        x: w * (STRIP_SLOTS[slot] ?? 0.5),
        y: h * 0.87 + (slot % 2) * 3,
        size: h * 0.3 * (STRIP_SCALE[kind] ?? 1),
        dir: STRIP_DIRS[slot] ?? 1,
        sleeping: c.sleeping,
      };
    });
  }
  const placed = critters.map((c, i) => {
    const back = i % 2 === 1;
    const kind = c.critter.species;
    return {
      kind,
      look: lookOf(c.critter),
      x: w * (0.06 + (0.88 * i) / Math.max(1, n - 1)),
      y: h * (back ? 0.8 : 0.94),
      size: h * (back ? 0.21 : 0.26) * (kind === 'hedgehog' || kind === 'frog' ? 0.92 : 1),
      dir: i % 3 ? NEG : POS,
      sleeping: c.sleeping,
      back,
    };
  });
  return [...placed.filter((p) => p.back), ...placed.filter((p) => !p.back)];
}

/**
 * The farm under a chat's header: the land drawn once without its cast, and each friend's critter
 * from their own cached layers, so the farm shows who really lives there. When the header has
 * shrunk all the way, the critters settle in two drawings.
 */
/** The sprout a dewdrop brings up in the header: its size, and where on the strip's ground. */
export const SPROUT = 90;
export const sproutBox = (width: number, height: number) => ({
  x: width * 0.42 - SPROUT / 2,
  y: height * 0.62 - SPROUT,
  width: SPROUT,
  height: SPROUT,
});

export function FarmHeaderArt({
  season,
  critters,
  width,
  height,
  collapsed,
  sproutId,
  night = false,
}: {
  /** The travel id where a dewdrop's sprout pops up (signature motion). */
  readonly sproutId?: string;
  readonly season: string;
  readonly critters: readonly HeaderCritter[];
  readonly width: number;
  readonly height: number;
  /** 1 once the header is as small as it gets. */
  readonly collapsed: SharedValue<number>;
  /**
   * After dark the critters are home (`12 States`, the chat at night): the cottages under the
   * stars, a lamp in the window of each friend still up.
   */
  readonly night?: boolean;
}) {
  const store = useArt();
  const reduce = useReduceMotion();
  const lit = critters
    .filter((c) => !c.sleeping)
    .map((c) => c.critter.species)
    .join(',');
  const land = useArtStill(
    night
      ? { scene: 'widget', width, height, attrs: { season, lit: lit || 'none' } }
      : { scene: 'strip', width, height, attrs: { season, state: 'nocast' } },
  );
  const key = JSON.stringify(critters);
  const layers = useMemo(() => {
    if (night) return [];
    return placeCritters(critters, width, height).flatMap((p, i) =>
      critterLayers(store.art, p.kind, p.look, {
        size: p.size,
        state: p.sleeping ? 'sleep' : 'open',
        dir: p.dir,
        dpr: store.dpr,
      }).map((l) => ({
        key: `${i}:${l.key}`,
        image: l.image,
        x: p.x - l.originX,
        y: p.y - l.originY,
        w: l.width,
        h: l.height,
        feet: p.y,
      })),
    );
    // The layers are keyed by the critters' looks and places.
  }, [store, key, width, height, night]);
  const squash = useSharedValue(0);
  useAnimatedReaction(
    () => collapsed.get() >= 1,
    (now, before) => {
      if (reduce || before === null || now === before) return;
      // Two drawings on twos: a small squash, then rest.
      squash.set(
        withSequence(
          withTiming(travel.landingSquash, { duration: 0 }),
          withDelay(motion.twos.frameMs, withTiming(0, { duration: 0 })),
        ),
      );
    },
  );
  const transforms = useMemo(
    () => layers.map((l) => ({ feet: l.feet, x: l.x + l.w / 2 })),
    [layers],
  );
  return (
    <View style={{ width, height }} pointerEvents="none">
      <Canvas style={{ width, height }}>
        {land ? <Image image={land} x={0} y={0} width={width} height={height} /> : null}
        {layers.map((l, i) => (
          <SettlingLayer key={l.key} squash={squash} origin={transforms[i] ?? { feet: 0, x: 0 }}>
            <Image image={l.image} x={l.x} y={l.y} width={l.w} height={l.h} />
          </SettlingLayer>
        ))}
      </Canvas>
      {sproutId ? <TravelSpot id={sproutId} box={sproutBox(width, height)} /> : null}
    </View>
  );
}

function SettlingLayer({
  squash,
  origin,
  children,
}: {
  readonly squash: SharedValue<number>;
  readonly origin: { readonly feet: number; readonly x: number };
  readonly children: ReactNode;
}) {
  const transform = useDerivedValue(() => [
    { scaleY: 1 - squash.get() },
    { scaleX: 1 + squash.get() / 2 },
  ]);
  return (
    <Group transform={transform} origin={{ x: origin.x, y: origin.feet }}>
      {children}
    </Group>
  );
}

/**
 * A visit's porch: the two critters on the bench, the porch owner's first (`S.porch`). Tapping
 * the pot opens its page.
 */
/** Where the porch seats its two critters (`S.porch`): feet 70% down, a third in from each side. */
export function porchSeat(i: number, width: number, height: number) {
  const size = height * 0.42;
  const x = width * (i === 0 ? 0.34 : 0.66);
  return { x: x - size / 2, y: height * 0.7 - size * 0.86, width: size, height: size };
}

export function PorchArt({
  cast,
  pot,
  width,
  height,
  night,
  onPot,
  seats = [],
}: {
  readonly cast: string;
  /** The travel ids of the two seats, in the cast's order: critters walking in land on them. */
  readonly seats?: readonly string[];
  /** The visit's porch pot: this season's plant and how far it has grown. */
  readonly pot: { readonly plant: string; readonly stage: number } | null;
  readonly width: number;
  readonly height: number;
  readonly night: boolean;
  readonly onPot: { readonly label: string; readonly open: () => void };
}) {
  // The pair shows once both have sat down (signature motion: they walk onto the porch).
  const shown = useTravelShownAll(seats);
  const castStyle = useAnimatedStyle(() => ({
    opacity: shown.reduce((least, s) => Math.min(least, s.get()), 1),
  }));
  return (
    <View style={{ width, height }} pointerEvents="box-none">
      <View pointerEvents="none">
        <ArtStill
          scene="porch"
          width={width}
          height={height}
          t={1.2}
          attrs={{ cast, state: 'empty', ...(night ? { night: true } : {}) }}
        />
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, castStyle]}>
          <ArtStill
            scene="porch"
            width={width}
            height={height}
            t={1.2}
            attrs={{ cast, ...(night ? { night: true } : {}) }}
          />
        </Animated.View>
        {seats.map((id, i) => (
          <TravelSpot key={id} id={id} box={porchSeat(i, width, height)} />
        ))}
      </View>
      {pot ? (
        <Press
          onPress={onPot.open}
          darken={false}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={onPot.label}
          style={{ position: 'absolute', left: width / 2 - 30.5, top: height - 94 }}
        >
          <ArtStill
            scene="plant"
            width={62}
            height={84}
            attrs={{ name: pot.plant, stage: pot.stage, pot: true, color: 'none' }}
          />
        </Press>
      ) : null}
    </View>
  );
}
