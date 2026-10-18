import type { Critter } from '@kithfield/contracts';
import { useNavigation } from 'expo-router';
import { useRef } from 'react';

import { timing, travelIds, useTravel, type FlightHandle } from '../../../ui/travel';
import { lookOf } from '../model/people';
import { go } from '../routes';
import { meetChoice } from './meet-choice';

/** A face drawn at the size it swells to in flight, so it never blurs. */
const FACE_IN_FLIGHT = 76;
/** How far it swells at the top of its arc, and how high the arc rises (points). */
const FACE_SWELL = 0.35;
const FACE_ARC = 70;

/**
 * Meeting a friend's critter from their message: the face lifts out of the chat, arcs to the
 * Farm tab and lands as their whole critter, then their card rises (signature motion).
 */
export function useMeet(farm: string, person: string | undefined, critter: Critter | undefined) {
  const travel = useTravel();
  const navigation = useNavigation();
  const flight = useRef<FlightHandle | null>(null);
  return (seq: number | null) => {
    if (!person || !critter) return;
    const from = travelIds.chatFace(farm, seq ?? -1);
    const to = travelIds.farmCritter(farm, person);
    const choice = meetChoice({
      flying: flight.current !== null,
      face: travel.has(from),
      onFarm: travel.has(to),
    });
    if (choice === 'finish') return flight.current?.finish();
    if (choice === 'card') return go.critter(farm, person);
    const done = () => {
      flight.current = null;
    };
    flight.current = travel.fly({
      from,
      to,
      sprite: { avatar: critter.species, look: lookOf(critter), size: FACE_IN_FLIGHT },
      morph: true,
      grow: FACE_SWELL,
      arc: FACE_ARC,
      durationMs: timing('critterTravel', 'out'),
      backMs: timing('critterTravel', 'back'),
      // Back in the chat before it landed: no card.
      onTouchdown: () => (navigation.isFocused() ? undefined : go.critter(farm, person)),
      onLanded: done,
      onReturned: done,
    });
    go.farm();
  };
}
