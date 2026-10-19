import { fireLoop } from '@kithfield/art';
import type { FarmId } from '@kithfield/contracts';
import type { FarmView } from '@kithfield/farm';
import { sampleCurves } from '@kithfield/theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useArt, whenIdle } from '../../ui/art/art-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { timing, travelIds, useTravel } from '../../ui/travel';
import { openFire } from '../fire/fire-glow';
import { fireFlight, roomFlameSize } from '../fire/fire-travel';
import { rhythmRoutes } from '../rhythm/routes';
import { FLAME as FARM_FLAME } from './farm-fire';
import { LANDMARKS } from './scene-layout';

/*
 * Ways out of the farm that leave from the scene itself (signature motion): into the fire room
 * through the fire ring, and the week's crops hopping out of the patch into the Sunday basket.
 */

/** Screens open by then even if what flies never took off. */
const OPEN_AT_LATEST_MS = 250;

/** Calls `open` once: when the flight takes off, or after a moment if it never does. */
function onceAirborne(open: () => void) {
  let opened = false;
  const go = () => {
    if (opened) return;
    opened = true;
    open();
  };
  setTimeout(go, OPEN_AT_LATEST_MS);
  return go;
}

/** How far the farm zooms toward its fire ring on the way into the fire room. */
const FIRE_ZOOM = 2.2;
const fireEase = Easing.bezier(...sampleCurves.fireZoom);

/**
 * The way into the fire room (signature motion): the farm zooms toward its fire ring while its
 * flame, if lit, flies into the room's. Coming back, the farm zooms out again. Under Reduce Motion
 * the room only fades in.
 */
export function useFireWay(
  farm: FarmId,
  { width, height, screen }: { width: number; height: number; screen: number },
  lit: boolean,
) {
  const travel = useTravel();
  const reduce = useReduceMotion();
  const store = useArt();
  const zoom = useSharedValue(0);
  // The flame that flies is drawn ahead, while the farm is idle, so the way in never waits on it.
  useEffect(() => {
    if (!lit || reduce) return;
    return whenIdle(() => void fireLoop(store.art, roomFlameSize(width), store.dpr));
  }, [lit, reduce, store, width]);
  const ring = { x: width * LANDMARKS.fire.x, y: height * LANDMARKS.fire.y };
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: ring.x },
      { translateY: ring.y },
      { scale: 1 + zoom.get() * FIRE_ZOOM },
      { translateX: -ring.x },
      { translateY: -ring.y },
    ],
  }));
  useFocusEffect(
    useCallback(() => {
      zoom.set(
        withTiming(0, {
          duration: timing('fire', 'out'),
          easing: fireEase,
          reduceMotion: ReduceMotion.System,
        }),
      );
    }, [zoom]),
  );
  const open = () => {
    if (reduce) return openFire(farm);
    const ease = { duration: timing('fire', 'in'), easing: fireEase };
    zoom.set(withTiming(1, { ...ease, reduceMotion: ReduceMotion.Never }));
    if (!lit) return openFire(farm);
    // The room opens once the flame is in the air, so mounting it never holds the flame back.
    const go = onceAirborne(() => openFire(farm));
    travel.fly({
      ...fireFlight({ ...ring, flame: width * FARM_FLAME }, { width, height: screen }),
      onStart: go,
      onReturned: go,
    });
  };
  return { style, open };
}

/** The crops that hop, their size, and the storyboard's 150 ms between them. */
const CROPS = 3;
const CROP = 64;
const APART_MS = 150;

/**
 * The way into the Sunday harvest: the farm's grown crops hop out of the patch one by one into the
 * letter's basket, which wobbles once as the last lands. A resting field just opens the letter.
 */
export function useHarvestWay(
  farm: FarmId,
  view: FarmView | null,
  { width, height }: { width: number; height: number },
) {
  const travel = useTravel();
  const reduce = useReduceMotion();
  const open = () => {
    const crops = [...(view?.plants ?? [])]
      .filter((p) => p.stage > 0)
      .sort((a, b) => b.stage - a.stage)
      .slice(0, CROPS);
    if (reduce || crops.length === 0) return router.push(rhythmRoutes.recap(farm));
    const go = onceAirborne(() => router.push(rhythmRoutes.recap(farm)));
    const total = timing('harvest', 'total');
    const { x, y, rx } = LANDMARKS.patch;
    crops.forEach((plant, i) => {
      const cx = width * (x + (i - (crops.length - 1) / 2) * rx * 0.6);
      travel.fly({
        from: { x: cx - CROP / 2, y: height * y - CROP * 0.8, width: CROP, height: CROP },
        to: travelIds.harvestBasket(farm),
        sprite: {
          scene: 'plant',
          attrs: { name: plant.plant, stage: plant.stage, color: 'none' },
          width: CROP,
          height: CROP,
        },
        toWidth: CROP * 0.6,
        hops: { count: 1, height: 30 },
        arc: 40,
        hideTarget: false,
        delayMs: i * APART_MS,
        durationMs: total * 0.45,
        fade: 'out',
        ...(i === 0 ? { onStart: go, onReturned: go } : {}),
        ...(i === crops.length - 1 ? { onTouchdown: () => wobble(travel, farm, total) } : {}),
      });
    });
  };
  return { open };
}

/** The basket wobbles once as the last crop lands in it. */
function wobble(travel: ReturnType<typeof useTravel>, farm: FarmId, total: number) {
  const basket = travelIds.harvestBasket(farm);
  travel.fly({
    from: basket,
    to: basket,
    arc: 0,
    hideSource: false,
    hideTarget: false,
    durationMs: total * 0.2,
  });
}
