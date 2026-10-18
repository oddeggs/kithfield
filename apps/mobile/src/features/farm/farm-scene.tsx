import type { FarmState, PersonId } from '@kithfield/contracts';
import { STATUS_MS, type FarmView, type PlanView } from '@kithfield/farm';
import { View } from 'react-native';

import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { FarmCanvas } from './farm-canvas';
import { flagOf, hoursLeft, nameOf } from './farm-copy';
import { HOUSES, LANDMARKS, type PlacedHouse } from './scene-layout';
import { headOf, layoutBubbles, type BubbleWish } from './bubble-layout';
import { SpeechBubble } from './speech-bubble';
import { useFarmScene } from './use-farm-scene';

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
  targets,
}: {
  readonly state: FarmState | null;
  readonly view: FarmView | null;
  readonly me: PersonId | null;
  readonly width: number;
  readonly height: number;
  readonly night: boolean;
  readonly running: boolean;
  readonly now: number;
  readonly targets: SceneTargets;
}) {
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const scene = useFarmScene(state, view, { width, height }, night);
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
  const placed = layoutBubbles(wishes, width, 110);

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
      />
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
        x={width * LANDMARKS.fire.x}
        y={height * LANDMARKS.fire.y}
        w={width * LANDMARKS.fire.rx * 2}
        h={height * LANDMARKS.fire.ry * 2}
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
            label={t('farm.critter.label', {
              name: c.person === me ? t('farm.crowd.you') : nameOf(t, state, c.person),
              state: stateOf(c.person),
            })}
            onPress={() => targets.onCritter(c.person)}
          />
        );
      })}
      {placed.map((p, i) => {
        const w = wishes.find((x) => x.key === p.key);
        return w ? (
          <SpeechBubble
            key={p.key}
            text={w.text}
            {...(w.metaText ? { meta: w.metaText } : {})}
            mine={w.mine}
            tail={p.tail}
            maxWidth={w.maxWidth}
            width={p.width}
            running={running}
            phase={(i * 0.29) % 1}
            style={{ left: p.left, top: p.top }}
          />
        ) : null;
      })}
    </View>
  );
}
