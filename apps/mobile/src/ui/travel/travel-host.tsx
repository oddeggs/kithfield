import { motion } from '@kithfield/theme';
import { Canvas } from '@shopify/react-native-skia';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { makeMutable, runOnUI, type AnimatedRef, type DerivedValue } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';

import { useArt } from '../art/art-provider';
import { fadeTo } from '../motion/motion';
import { useReduceMotion } from '../motion/reduce-motion';
import {
  finishFlight,
  releaseFlight,
  retargetFlight,
  reverseFlight,
  measureBox,
  type FlightPlan,
  type FlightValues,
} from './flight';
import { FlightView } from './flight-view';
import { SHEET_SETTLE_MS, type Box } from './geometry';
import { PHASE, type FlightGeom } from './pose';
import { AnchorRegistry, type AnchorId } from './registry';
import { spriteOf, type Sprite, type SpriteSpec } from './sprite';

/** Where art leaves from or lands: a registered anchor's id, or a box on the window. */
export type Place = AnchorId | Box;

export interface FlightOptions {
  readonly from: Place;
  readonly to: Place;
  /** What flies. Left out, the source anchor's own sprite. */
  readonly sprite?: SpriteSpec;
  /**
   * What it becomes as it lands, drawn still on the target and faded in over the last stretch
   * (a face that lands as the whole critter). Left out, the target anchor's own sprite if the
   * flight was told to `morph`, otherwise nothing: the sprite itself lands.
   */
  readonly becomes?: SpriteSpec;
  readonly morph?: boolean;
  /** How long the storyboard gives the way out (and back): the spring settles in that time. */
  readonly durationMs?: number;
  readonly backMs?: number;
  /** How far above its higher end the path rises, in points; negative dips. */
  readonly arc?: number;
  /** How much the sprite swells at the top of its arc (0.3 is 30% bigger). */
  readonly grow?: number;
  /** The share of the source's width the sprite leaves at (1), and of the target's it lands at. */
  readonly startFit?: number;
  readonly fit?: number;
  /** Its width at each end in points, instead of a share of the box. */
  readonly fromWidth?: number;
  readonly toWidth?: number;
  /** Whether the source's and target's own drawings hide while the copy flies (both, by default). */
  readonly hideSource?: boolean;
  readonly hideTarget?: boolean;
  /** Progress held by a finger, 0 to 1, until `release`. */
  readonly drive?: DerivedValue<number>;
  /** Waits this long before leaving: a group of critters leaves one after another. */
  readonly delayMs?: number;
  /** It touches down on the target: the moment to start what comes next (a card rising). */
  readonly onTouchdown?: () => void;
  /** It has settled and handed over to the target's own drawing. */
  readonly onLanded?: () => void;
  readonly onReturned?: () => void;
}

/** A flight in the air, for the feature that started it to steer. */
export interface FlightHandle {
  /** Back to the source along the same path, from wherever it is. */
  reverse(): void;
  /** On to somewhere else from wherever it is, keeping its speed. */
  retarget(to: Place): void;
  /** A finger let go of a driven flight: on to the target or back, at `rate` progress a second. */
  release(forward: boolean, rate?: number): void;
  /** Skips to the landing. */
  finish(): void;
}

interface Flight {
  readonly key: number;
  readonly options: FlightOptions;
  readonly values: FlightValues;
  plan: FlightPlan;
  readonly sprite: Sprite;
  readonly becomes: Sprite | null;
  readonly fromId: AnchorId | null;
  toId: AnchorId | null;
}

interface TravelContextValue {
  readonly registry: AnchorRegistry;
  readonly fly: (options: FlightOptions) => FlightHandle;
}

export interface Travel {
  /** Starts a flight; the handle reverses, retargets or releases it. */
  readonly fly: (options: FlightOptions) => FlightHandle;
  /** Whether an anchor is on screen now, so a feature can travel to it or go another way. */
  readonly has: (id: AnchorId) => boolean;
}

const TravelContext = createContext<TravelContextValue | null>(null);

const idOf = (place: Place): AnchorId | null => (typeof place === 'string' ? place : null);
const boxOf = (place: Place): Box | null => (typeof place === 'string' ? null : place);

const startGeom: FlightGeom = {
  phase: PHASE.waiting,
  path: { p0: { x: 0, y: 0 }, p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, p3: { x: 0, y: 0 } },
  s0: 1,
  s1: 1,
  grow: 0,
  toBox: null,
  landedAt: 0,
  hid: false,
  step: -1,
  tilt: 0,
};

/** Where `ref` is on the window, measured on the JS side; null if it doesn't answer quickly. */
function windowBox(ref: AnimatedRef<View>, done: (box: Box | null) => void) {
  let answered = false;
  const answer = (box: Box | null) => {
    if (answered) return;
    answered = true;
    done(box);
  };
  const view = ref.current as unknown as {
    measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
  } | null;
  if (!view?.measureInWindow) return answer(null);
  view.measureInWindow((x, y, width, height) =>
    answer(width > 0 || height > 0 ? { x, y, width, height } : null),
  );
  setTimeout(() => answer(null), 100);
}

const noop: FlightHandle = {
  reverse: () => undefined,
  retarget: () => undefined,
  release: () => undefined,
  finish: () => undefined,
};

/** The overlay over everything, native sheets and covers included, that travelling art flies in. */
function Overlay({ children }: { readonly children: ReactNode }) {
  const layer = (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Canvas style={StyleSheet.absoluteFill}>{children}</Canvas>
    </View>
  );
  return Platform.OS === 'ios' ? <FullWindowOverlay>{layer}</FullWindowOverlay> : layer;
}

/**
 * The shared layer travelling art flies in, above the navigation stack, sheets and covers, so a
 * critter can leave one screen and land in the next. Sources and targets register matched ids
 * (`TravelAnchor`, `TravelSpot`); a flight measures both, hides the source's drawing, flies a copy
 * drawn from the art's caches on the UI thread, then reveals the target's.
 */
export function TravelHost({ children }: { readonly children: ReactNode }) {
  const store = useArt();
  const reduce = useReduceMotion();
  const registry = useMemo(() => new AnchorRegistry(), []);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const live = useRef(new Map<number, Flight>());
  const next = useRef(1);
  // A target that arrives while its flight is in the air is measured from then on.
  const [, arrived] = useReducer((n: number) => n + 1, 0);
  useEffect(
    () =>
      registry.listen(() => {
        if (live.current.size > 0) arrived();
      }),
    [registry],
  );

  const end = useCallback(
    (flight: Flight, how: 'touchdown' | 'landed' | 'returned') => {
      if (how === 'touchdown') return flight.options.onTouchdown?.();
      if (!live.current.delete(flight.key)) return;
      if (flight.fromId) registry.release(flight.fromId);
      if (flight.toId) registry.release(flight.toId);
      setFlights((all) => all.filter((f) => f.key !== flight.key));
      if (how === 'landed') flight.options.onLanded?.();
      else flight.options.onReturned?.();
    },
    [registry],
  );

  const fly = useCallback(
    (options: FlightOptions): FlightHandle => {
      const fromId = idOf(options.from);
      const toId = idOf(options.to);
      const from = fromId ? registry.hold(fromId) : null;
      const to = toId ? registry.hold(toId) : null;
      const outMs = options.durationMs ?? SHEET_SETTLE_MS;
      const backMs = options.backMs ?? outMs;

      // Reduce Motion: nothing travels. What it lands on appears with a cross-fade.
      if (reduce) {
        if (to && options.hideTarget !== false) {
          to.shown.set(0);
          to.shown.set(fadeTo(1));
        }
        setTimeout(() => {
          if (fromId) registry.release(fromId);
          if (toId) registry.release(toId);
          options.onTouchdown?.();
          options.onLanded?.();
        }, motion.fade.durationMs);
        return noop;
      }

      const spec = options.sprite ?? (fromId ? registry.peek(fromId)?.sprite : undefined);
      if (!spec) {
        if (fromId) registry.release(fromId);
        if (toId) registry.release(toId);
        if (__DEV__) console.warn('travel: nothing to fly; give the flight or its source a sprite');
        options.onTouchdown?.();
        options.onLanded?.();
        return noop;
      }
      const sprite = spriteOf(store, spec);
      const becomesSpec =
        options.becomes ?? (options.morph && toId ? registry.peek(toId)?.sprite : undefined);
      const values: FlightValues = {
        p: makeMutable(0),
        geom: makeMutable(startGeom),
        clock: makeMutable(0),
        goal: makeMutable(1),
        rate: makeMutable(0),
        driven: makeMutable(options.drive ? 1 : 0),
        hides: { source: options.hideSource ?? true, target: options.hideTarget ?? true },
        fromShown: from?.shown ?? null,
        toShown: to?.shown ?? null,
      };
      const plan: FlightPlan = {
        fromRef: from?.ref ?? null,
        fromBox: boxOf(options.from) ?? from?.box ?? null,
        toRef: to?.ref ?? null,
        toBox: boxOf(options.to) ?? to?.box ?? null,
        spriteWidth: sprite.width,
        startFit: options.startFit ?? 1,
        fromWidth: options.fromWidth ?? null,
        toWidth: options.toWidth ?? null,
        fit: options.fit ?? (becomesSpec ? 0.8 : 1),
        arc: options.arc ?? null,
        grow: options.grow ?? 0,
        outMs,
        delayMs: options.delayMs ?? 0,
      };
      const flight: Flight = {
        key: next.current++,
        options,
        values,
        plan,
        sprite,
        becomes: becomesSpec ? spriteOf(store, becomesSpec) : null,
        fromId,
        toId,
      };
      live.current.set(flight.key, flight);
      const launch = (box: Box | null) => {
        if (!live.current.has(flight.key)) return;
        // Measured on the window: right inside native sheets too, where the UI thread's
        // measure is relative to the sheet.
        if (box) flight.plan = { ...plan, fromRef: null, fromBox: box };
        setFlights((all) => [...all, flight]);
      };
      if (from?.ref && !boxOf(options.from)) windowBox(from.ref, launch);
      else launch(null);

      const size = { spriteWidth: sprite.width, fit: plan.fit, toWidth: plan.toWidth };
      return {
        reverse: () => runOnUI(reverseFlight)(values, backMs),
        finish: () => runOnUI(finishFlight)(values),
        release: (forward, rate = 0) =>
          runOnUI(releaseFlight)(values, forward, rate, outMs, backMs),
        retarget: (place) => {
          if (!live.current.has(flight.key)) return;
          const id = idOf(place);
          const entry = id ? registry.hold(id) : null;
          if (flight.toId) registry.release(flight.toId);
          flight.toId = id;
          const ref = entry?.ref ?? null;
          const box = boxOf(place);
          runOnUI((r: typeof ref, b: Box | null) => {
            'worklet';
            const target = measureBox(r) ?? b;
            if (target) retargetFlight(values, target, size, outMs);
          })(ref, box);
          arrived();
        },
      };
    },
    [registry, reduce, store],
  );

  const value = useMemo(() => ({ registry, fly }), [registry, fly]);
  return (
    <TravelContext.Provider value={value}>
      {children}
      {/* Mounted once and kept, empty between flights, so a flight's first frame never waits
          on the overlay and its canvas being made. */}
      <Overlay>
        {flights.map((f) => (
          <FlightView
            key={f.key}
            values={f.values}
            plan={f.plan}
            sprite={f.sprite}
            becomes={f.becomes}
            toRef={f.toId ? (registry.peek(f.toId)?.ref ?? null) : null}
            drive={f.options.drive ?? null}
            onDone={(how) => end(f, how)}
          />
        ))}
      </Overlay>
    </TravelContext.Provider>
  );
}

function useTravelContext(): TravelContextValue {
  const value = useContext(TravelContext);
  if (value === null) throw new Error('travel needs a TravelHost');
  return value;
}

/** Starts flights: `fly({ from, to, sprite })` answers a handle to reverse or retarget it. */
export function useTravel(): Travel {
  const { fly, registry } = useTravelContext();
  return useMemo(() => ({ fly, has: (id: AnchorId) => registry.has(id) }), [fly, registry]);
}

/** The registry, for the anchors. */
export function useTravelRegistry(): AnchorRegistry {
  return useTravelContext().registry;
}
