import type { FarmState, PersonId } from '@kithfield/contracts';
import { STATUS_MS, type FarmView, type PlanView } from '@kithfield/farm';
import { useEffect, useRef, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { sheetTo } from '../../ui/motion/motion';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { TravelSpot, travelIds } from '../../ui/travel';
import { FarmCanvas } from './farm-canvas';
import { flagOf, hoursLeft, nameOf } from './farm-copy';
import {
  doorStep,
  FIRE_TOP,
  fireTarget,
  HOUSES,
  LANDMARKS,
  type PlacedHouse,
} from './scene-layout';
import { headOf, layoutBubbles, type BubbleWish } from './bubble-layout';
import type { FarmReaction } from './reactions';
import { SpeechBubble } from './speech-bubble';
import { useFarmScene } from './use-farm-scene';
// The first-run tip that points at your own critter.
import { HintOverlay } from '../hints/hint-overlay';

export interface SceneTargets {
  readonly onCritter: (person: PersonId) => void;
  readonly onHouse: (house: PlacedHouse) => void;
  readonly onFire: () => void;
  readonly onPatch: () => void;
  readonly onPlan: (plan: PlanView) => void;
}

/** A tap target over the art, at least 44 points. */
function Target({
  x,
  y,
  w,
  h,
  label,
  onPress,
}: {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const width = Math.max(44, w);
  const height = Math.max(44, h);
  return (
    <Press
      onPress={onPress}
      haptic="select"
      darken={false}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={{
        position: 'absolute',
        left: x - width / 2,
        top: y - height / 2,
        width,
        height,
      }}
    />
  );
}

/** A bubble that pops up from its tail on the sheet's spring as it appears. */
function Popping({
  style,
  children,
}: {
  readonly style: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.set(sheetTo(1, reduce));
  }, [pop, reduce]);
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.get() * 2),
    transform: [{ scale: 0.2 + 0.8 * pop.get() }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', transformOrigin: 'left bottom' }, style, popStyle]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The farm canvas with what sits on it: tap targets for every critter, cottage and landmark,
 * status bubbles over critters, a word for a friend dozing, and the flag of the newest plan.
 */
export function FarmScene({
  state,
  view,
  me,
  width,
  height,
  night,
  running,
  now,
  fire = null,
  coverTop,
  said = null,
  targets,
  hints = false,
  onDrawn,
}: {
  readonly state: FarmState | null;
  readonly view: FarmView | null;
  readonly me: PersonId | null;
  readonly width: number;
  readonly height: number;
  readonly night: boolean;
  readonly running: boolean;
  readonly now: number;
  /** The fire on the farm: whether it is lit, and the line about who is by it. */
  readonly fire?: { readonly lit: boolean; readonly line: string | null } | null;
  /** Where something laid over the farm (its sheet) begins, from the scene's top. */
  readonly coverTop?: number;
  /** What a friend just said, popped over their cottage for a moment. */
  readonly said?: FarmReaction | null;
  readonly targets: SceneTargets;
  /** The farm is in front, loaded and settled: the first tip may point at your critter. */
  readonly hints?: boolean;
  /** Told once the still and its critters are drawn, so the farm can be revealed. */
  readonly onDrawn?: () => void;
}) {
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const scene = useFarmScene(state, view, { width, height }, night, fire?.lit === true);
  const drawnRef = useRef(onDrawn);
  drawnRef.current = onDrawn;
  useEffect(() => {
    if (scene.drawn) drawnRef.current?.();
  }, [scene.drawn]);
  const spotOf = new Map(scene.placement.critters.map((c) => [c.person, c.spot]));

  const stateOf = (person: PersonId) => {
    const c = view?.critters.find((x) => x.person === person);
    if (c?.hibernating) return t('farm.state.hibernating');
    if (c?.paused) return t('farm.state.napping');
    return c?.sleepy ? t('farm.state.dozing') : t('farm.state.out');
  };

  // Status bubbles, a word for one friend dozing without one (the design's "Otis is dozing"),
  // and the newest plan's flag, laid out so none covers another.
  const plan = view?.plans.find((p) => !p.seed.someday) ?? null;
  const head = (person: PersonId) => {
    const spot = spotOf.get(person);
    return spot ? headOf(spot, width, height) : null;
  };
  const wishes: (BubbleWish & { mine: boolean; metaText?: string })[] = [];
  for (const c of view?.critters ?? []) {
    const at = head(c.person);
    const member = state?.members.find((m) => m.person === c.person);
    if (!at || !c.status || !member?.status) continue;
    const mine = c.person === me;
    wishes.push({
      key: `status:${c.person}`,
      text: c.status,
      ...at,
      maxWidth: mine ? 160 : 150,
      meta: mine,
      mine,
      ...(mine
        ? {
            metaText: t('farm.bubble.yours', {
              hours: hoursLeft(member.status.at, now, STATUS_MS),
            }),
          }
        : {}),
    });
  }
  const dozer = (view?.critters ?? []).find(
    (c) => c.sleepy && !c.status && c.person !== me && spotOf.has(c.person),
  );
  const dozerAt = dozer ? head(dozer.person) : null;
  if (dozer && dozerAt) {
    wishes.push({
      key: 'dozing',
      text: t('farm.dozing', { name: nameOf(t, state, dozer.person) }),
      ...dozerAt,
      maxWidth: 170,
      meta: false,
      mine: false,
      order: 1,
    });
  }
  if (fire?.line) {
    // "Mo's by the fire", over the fire's glow (16-02).
    wishes.push({
      key: 'fire',
      text: fire.line,
      x: width * LANDMARKS.fire.x,
      y: height * LANDMARKS.fire.y - width * FIRE_TOP,
      maxWidth: 170,
      meta: false,
      mine: false,
      order: 1,
    });
  }
  if (plan?.seed.title) {
    wishes.push({
      key: 'plan',
      text: flagOf(t, plan.seed.title),
      // Beside the flag, in the short hand the farm home draws ("picnic?").
      x: width * LANDMARKS.stake.x + 21,
      y: height * LANDMARKS.stake.y + 2,
      maxWidth: 150,
      meta: false,
      mine: false,
      order: 2,
    });
  }
  // A friend's new message, over their cottage (or over them, without one), before the rest.
  const saidHouse = said ? scene.placement.houses.find((h) => h.person === said.person) : null;
  const saidAt = !said
    ? null
    : saidHouse
      ? {
          x: width * HOUSES[saidHouse.key].x,
          // Its tail on the cottage's wall: the far cottages sit just under the farm's header.
          y: height * HOUSES[saidHouse.key].y - width * HOUSES[saidHouse.key].size * 0.3,
        }
      : head(said.person);
  if (said && saidAt && !reduce) {
    wishes.push({
      key: `said:${said.key}`,
      text: said.text,
      ...saidAt,
      maxWidth: 170,
      meta: false,
      mine: false,
      order: -1,
    });
  }
  const placed = layoutBubbles(wishes, width, 110, 10, fontScale);

  // A critter's label carries its status, so VoiceOver reads the words with whose they are; the
  // bubbles themselves stay out of its way.
  const labelOf = (person: PersonId) => {
    const name = person === me ? t('farm.crowd.you') : nameOf(t, state, person);
    const status = view?.critters.find((c) => c.person === person)?.status ?? null;
    return status
      ? t('farm.critter.labelStatus', { name, state: stateOf(person), status })
      : t('farm.critter.label', { name, state: stateOf(person) });
  };

  // The spotlight of the first tip, round your own critter as the design draws it.
  const mine = scene.critters.find((c) => c.person === me) ?? null;
  const spot = mine
    ? {
        x: mine.x - mine.poses.open.ox + mine.poses.open.w / 2,
        y: mine.y - mine.poses.open.oy + mine.poses.open.h / 2,
        r: (52 * width) / 393,
      }
    : null;

  return (
    <View style={{ width, height }}>
      <FarmCanvas
        width={width}
        height={height}
        backdrop={scene.backdrop}
        critters={scene.critters}
        night={night}
        running={running}
        reduce={reduce}
        fire={scene.fire}
        {...(state ? { travel: state.farm } : {})}
      />
      {/* Where a critter's face travelling from a chat lands as the critter (signature motion). */}
      {state
        ? scene.critters.map((c) => {
            const pose = c.poses.open;
            return (
              <TravelSpot
                key={`travel:${c.person}`}
                id={travelIds.farmCritter(state.farm, c.person)}
                box={{ x: c.x - pose.ox, y: c.y - pose.oy, width: pose.w, height: pose.h }}
                sprite={{
                  sprite: {
                    width: pose.w,
                    height: pose.h,
                    drawings: [[{ image: pose.image, x: 0, y: 0, w: pose.w, h: pose.h }]],
                  },
                }}
              />
            );
          })
        : null}
      {/* Where a gift left for a friend lands: the step of their cottage (signature motion). */}
      {state
        ? scene.placement.houses.map((h) => (
            <TravelSpot
              key={`door:${h.key}`}
              id={travelIds.farmDoor(state.farm, h.person)}
              box={doorStep(h.key, width, height)}
            />
          ))
        : null}
      {scene.placement.houses.map((h) => {
        const house = HOUSES[h.key];
        const s = width * house.size;
        const name = nameOf(t, state, h.person);
        return (
          <Target
            key={`house:${h.key}`}
            x={width * house.x}
            y={height * house.y - s * 0.45}
            w={s * 1.2}
            h={s * 1.0}
            label={t(h.former ? 'farm.house.formerLabel' : 'farm.house.label', { name })}
            onPress={() => targets.onHouse(h)}
          />
        );
      })}
      <Target
        x={width * LANDMARKS.patch.x}
        y={height * LANDMARKS.patch.y}
        w={width * LANDMARKS.patch.rx * 2}
        h={height * LANDMARKS.patch.ry * 2}
        label={t('farm.patch.label')}
        onPress={targets.onPatch}
      />
      <Target
        {...fireTarget(width, height, coverTop)}
        label={t('farm.fire.label')}
        onPress={targets.onFire}
      />
      {plan?.seed.title ? (
        <Target
          x={width * LANDMARKS.stake.x}
          y={height * LANDMARKS.stake.y}
          w={width * LANDMARKS.stake.rx * 2}
          h={height * LANDMARKS.stake.ry * 2}
          label={plan.seed.title}
          onPress={() => targets.onPlan(plan)}
        />
      ) : null}
      {scene.placement.critters.map((c) => {
        const s = width * c.spot.size;
        return (
          <Target
            key={`critter:${c.person}`}
            x={width * c.spot.x}
            y={height * c.spot.y - s * 0.55}
            w={s * 0.9}
            h={s * 1.1}
            label={labelOf(c.person)}
            onPress={() => targets.onCritter(c.person)}
          />
        );
      })}
      <View
        pointerEvents="box-none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: 'absolute', left: 0, top: 0, width, height }}
      >
        {placed.map((p, i) => {
          const w = wishes.find((x) => x.key === p.key);
          if (w && w.key.startsWith('said:')) {
            return (
              <Popping
                key={p.key}
                style={{ left: p.left, top: p.top, width: p.width, height: p.height }}
              >
                <SpeechBubble
                  text={w.text}
                  tail={p.tail}
                  maxWidth={Math.max(w.maxWidth, p.width)}
                  width={p.width}
                  running={running}
                  style={{ left: 0, top: 0 }}
                />
              </Popping>
            );
          }
          return w ? (
            <SpeechBubble
              key={p.key}
              text={w.text}
              {...(w.metaText ? { meta: w.metaText } : {})}
              mine={w.mine}
              tail={p.tail}
              maxWidth={Math.max(w.maxWidth, p.width)}
              width={p.width}
              running={running}
              phase={(i * 0.29) % 1}
              style={{ left: p.left, top: p.top }}
            />
          ) : null;
        })}
      </View>
      <HintOverlay hint="critter" show={hints && spot !== null} spot={spot} tabBar />
    </View>
  );
}
