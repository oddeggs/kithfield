import type { Critter, FarmId, PersonId } from '@kithfield/contracts';
import { night } from '@kithfield/theme';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useArt } from '../../ui/art/art-provider';
import type { ArtStore } from '../../ui/art/art-store';
import { ArtStill } from '../../ui/art/art-view';
import { sceneLook } from '../../ui/art/critter-look';
import { easings, fadeTo } from '../../ui/motion/motion';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import {
  timing,
  TravelAnchor,
  TravelSpot,
  useTravel,
  useTravelShown,
  type FlightHandle,
} from '../../ui/travel';
import { bakeCritter } from './farm-bake';
import { withAlpha } from './over-art';
import { NightVeil, SceneLoop } from './panel';

/*
 * Where the art's `movein` scene puts things, as fractions of its size: the newcomer at the foot
 * of the path, and the cottage at the top of it on the far hill. The hill under the cottage is a
 * little below the hill's own line (0.58): the cottage's foot, as the golden render draws it.
 */
const FOOT = { x: 0.5, y: 0.84, size: 0.26 } as const;
const COTTAGE = { x: 0.5, y: 0.592, size: 0.34, lift: 6 } as const;
/** The renderer's cottage is 60 units across; its window's middle, in those units. */
const WINDOW = { x: 15.5, y: -20.5 } as const;
/**
 * The newcomer home, standing a little in front of the door, as wide as 62% of the cottage
 * (`18 Motion`, the walk's last frame).
 */
const AT_DOOR = { size: 0.62, ahead: 0.2 } as const;
const HOPS = { count: 5, height: 8 } as const;

/** The art's `SZ`: how big a critter stands in a scene, from the cast table, else its own. */
const FIRST_CAST: Readonly<Record<string, number>> = {
  rabbit: 0.5,
  hedgehog: 0.78,
  frog: 0.78,
  mole: 0.62,
  sheep: 0.66,
  owl: 0.58,
};

function stageScale(store: ArtStore, kind: string): number {
  const stage = store.art.internals.CR[kind]?.stage;
  return typeof stage === 'number' ? stage : (FIRST_CAST[kind] ?? 0.6);
}

/** The scene's places for a newcomer of `kind` in a `width`×`height` move-in scene. */
function placesOf(store: ArtStore, kind: string, width: number, height: number) {
  const k = (width * COTTAGE.size) / 60;
  const base = height * COTTAGE.y + COTTAGE.lift;
  const door = width * COTTAGE.size * AT_DOOR.size;
  return {
    foot: { x: width * FOOT.x, y: height * FOOT.y },
    size: (width * FOOT.size * stageScale(store, kind)) / 0.6,
    // A pose box stands its critter with its feet 86% down.
    door: {
      x: width * COTTAGE.x - door / 2,
      y: base + door * AT_DOOR.ahead - door * 0.86,
      width: door,
      height: door,
    },
    window: { x: width * COTTAGE.x + WINDOW.x * k, y: base + WINDOW.y * k, r: 22 * k },
  };
}

/**
 * The move-in scene, and the newcomer's walk home (`18 Motion`, picker to farm): once the
 * confetti has fallen they hop up the path to their cottage, where the window lights. The scene
 * draws itself without them (`state: 'empty'`) while they walk.
 */
export function MoveInScene({
  farm,
  person,
  critter,
  attrs,
  width,
  height,
  celebrating,
  walk,
}: {
  readonly farm: FarmId;
  readonly person: PersonId;
  readonly critter: Critter;
  readonly attrs: Record<string, string>;
  readonly width: number;
  readonly height: number;
  readonly celebrating: boolean;
  /** Whether to set off home now. */
  readonly walk: boolean;
}) {
  const store = useArt();
  const travel = useTravel();
  const reduce = useReduceMotion();
  const kind = critter.species;
  const places = useMemo(() => placesOf(store, kind, width, height), [store, kind, width, height]);
  // The newcomer as the scene draws them, shadow and all, to set off from.
  const pose = useMemo(
    () => bakeCritter(store, critter, places.size, 1, false).open,
    [store, critter, places.size],
  );
  const footId = `farm:movein:foot:${farm}:${person}`;
  const doorId = `farm:movein:door:${farm}:${person}`;

  const there = useSharedValue(1);
  const home = useSharedValue(0);
  const lit = useSharedValue(0);
  const footShown = useTravelShown(footId);
  const scene = useAnimatedStyle(() => ({ opacity: there.get() * footShown.get() }));
  const atDoor = useAnimatedStyle(() => ({ opacity: home.get() }));
  const glow = useAnimatedStyle(() => ({ opacity: lit.get() }));

  const flight = useRef<FlightHandle | null>(null);
  const flown = useRef(false);
  useEffect(() => {
    if (!walk || flown.current) return;
    flown.current = true;
    const cottageMs = timing('pickerToFarm', 'cottage');
    flight.current = travel.fly({
      from: footId,
      to: doorId,
      morph: true,
      fit: 1,
      hops: HOPS,
      arc: -10,
      durationMs: timing('pickerToFarm', 'walk'),
      onStart: () => {
        there.set(reduce ? fadeTo(0) : 0);
        home.set(reduce ? fadeTo(1) : 1);
      },
      onTouchdown: () => {
        lit.set(
          reduce
            ? fadeTo(1)
            : withTiming(1, {
                duration: cottageMs,
                easing: easings.reveal,
                reduceMotion: ReduceMotion.Never,
              }),
        );
      },
      onLanded: () => {
        flight.current = null;
      },
      onReturned: () => {
        flight.current = null;
        there.set(1);
        home.set(0);
      },
    });
  }, [walk, travel, footId, doorId, reduce, there, home, lit]);
  // Leaving mid-walk: nothing is left in the air.
  useEffect(() => () => flight.current?.cancel(), []);

  const doorAttrs = { ...sceneLook(critter), pose: 'wave', color: 'none' };
  const lamp = places.window;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width, height }} pointerEvents="none">
      <ArtStill scene="movein" width={width} height={height} attrs={{ ...attrs, state: 'empty' }} />
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, scene]}>
        <ArtStill scene="movein" width={width} height={height} attrs={attrs} />
        {celebrating ? (
          // While the confetti falls the scene plays on twos, drawn lighter so the loop fits the
          // art's budget; then the crisp still underneath shows.
          <SceneLoop scene="movein" width={width} height={height} attrs={attrs} dpr={1.4} />
        ) : null}
      </Animated.View>
      <TravelSpot
        id={footId}
        box={{
          x: places.foot.x - pose.ox,
          y: places.foot.y - pose.oy,
          width: pose.w,
          height: pose.h,
        }}
        sprite={{
          sprite: {
            width: pose.w,
            height: pose.h,
            drawings: [[{ image: pose.image, x: 0, y: 0, w: pose.w, h: pose.h }]],
          },
        }}
      />
      <TravelAnchor
        id={doorId}
        sprite={{
          scene: 'pose',
          attrs: doorAttrs,
          width: places.door.width,
          height: places.door.height,
        }}
        style={{
          position: 'absolute',
          left: places.door.x,
          top: places.door.y,
          width: places.door.width,
          height: places.door.height,
        }}
      >
        <Animated.View style={atDoor}>
          <ArtStill
            scene="pose"
            width={places.door.width}
            height={places.door.height}
            attrs={doorAttrs}
          />
        </Animated.View>
      </TravelAnchor>
      <NightVeil width={width} height={height} />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: lamp.x - lamp.r,
            top: lamp.y - lamp.r,
            width: lamp.r * 2,
            height: lamp.r * 2,
            borderRadius: lamp.r,
            experimental_backgroundImage: `radial-gradient(${withAlpha(night.lamp, 0.8)}, ${withAlpha(night.lamp, 0)} 70%)`,
          },
          glow,
        ]}
      />
    </View>
  );
}
