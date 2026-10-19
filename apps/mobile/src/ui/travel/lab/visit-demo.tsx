import { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo, sheetTo } from '../../motion/motion';
import { useReduceMotion } from '../../motion/reduce-motion';
import { TravelSpot, useTravelShownAll } from '../anchors';
import type { FlightHandle } from '../travel-host';
import { timing } from '../timings';
import { BlankBubble, ChatPaper, LabNotes, LabStage, STAGE_W, useLabFlight } from './kit';

const H = 600;
const PORCH_H = 430;
/** Where the porch scene seats its two critters (`S.porch`): feet at 70% down, a third in. */
const SEAT = (i: number) => {
  const size = PORCH_H * 0.42;
  const x = STAGE_W * (i === 0 ? 0.34 : 0.66);
  return { x: x - size / 2, y: PORCH_H * 0.7 - size * 0.86, width: size, height: size };
};
const SEATS = ['lab:seat:0', 'lab:seat:1'] as const;
const GUEST = 'rabbit';
const HOST = 'owl';
/** The farm pans toward this door before it opens onto the porch. */
const DOOR_ORIGIN = { x: STAGE_W * 0.6, y: H * 0.22 };
const total = timing('visitStart', 'total');

/**
 * Starting a visit: the farm pans to the friend's door, which opens onto the porch; you walk in
 * from the left and they come from the door, and both sit as the porch chat fades up. Played
 * back, both walk off the way they came and the farm pans back.
 */
export function VisitDemo() {
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const { fly } = useLabFlight();
  const [flights, setFlights] = useState<FlightHandle[]>([]);
  const landed = useRef<FlightHandle[]>([]);
  const [open, setOpen] = useState(false);
  const pan = useSharedValue(0);
  const chat = useSharedValue(0);
  // The porch draws its pair once both have sat down on their seats.
  const seats = useTravelShownAll(SEATS);
  const farmStyle = useAnimatedStyle(() => ({
    opacity: 1 - pan.get(),
    transform: [
      { translateX: DOOR_ORIGIN.x },
      { translateY: DOOR_ORIGIN.y },
      { scale: 1 + pan.get() * 0.25 },
      { translateX: -DOOR_ORIGIN.x },
      { translateY: -DOOR_ORIGIN.y },
    ],
  }));
  const porchStyle = useAnimatedStyle(() => ({ opacity: pan.get() }));
  const castStyle = useAnimatedStyle(() => ({
    opacity: Math.min(seats[0]?.get() ?? 1, seats[1]?.get() ?? 1),
  }));
  const chatStyle = useAnimatedStyle(() => ({
    opacity: chat.get(),
    transform: [{ translateY: (1 - chat.get()) * 40 }],
  }));

  const visit = () => {
    if (open) return;
    setOpen(true);
    pan.set(reduce ? fadeTo(1) : sheetTo(1, false));
    const walk = { durationMs: total, hops: { count: 4, height: 8 }, arc: -10 } as const;
    const handles: FlightHandle[] = [];
    const sat = (i: number) => () => {
      const h = handles[i];
      if (h) landed.current.push(h);
    };
    handles.push(
      fly({
        ...walk,
        from: 'lab:offstage',
        to: SEATS[0],
        sprite: { critter: GUEST, size: 140 },
        hideSource: false,
        onLanded: sat(0),
      }),
    );
    handles.push(
      fly({
        ...walk,
        from: 'lab:porch-door',
        to: SEATS[1],
        sprite: { critter: HOST, size: 140 },
        hideSource: false,
        delayMs: total * 0.1,
        onTouchdown: () => chat.set(fadeTo(1)),
        onLanded: sat(1),
      }),
    );
    setFlights(handles);
  };

  const back = () => {
    if (!open) return;
    setOpen(false);
    chat.set(fadeTo(0));
    pan.set(reduce ? fadeTo(0) : sheetTo(0, false));
    // In the air: they turn back. Seated: they get up and walk off the way they came.
    const inAir = flights.filter((f) => landed.current.indexOf(f) === -1);
    for (const f of inAir) f.reverse();
    const seated = flights.length - inAir.length;
    setFlights([]);
    landed.current = [];
    if (seated === 0) return;
    const walk = { durationMs: total, hops: { count: 4, height: 8 }, arc: -10 } as const;
    fly({
      ...walk,
      from: SEATS[0],
      to: 'lab:offstage',
      sprite: { critter: GUEST, size: 140 },
      hideTarget: false,
    });
    fly({
      ...walk,
      from: SEATS[1],
      to: 'lab:porch-door',
      sprite: { critter: HOST, size: 140 },
      hideTarget: false,
      toWidth: 40,
    });
  };

  return (
    <View>
      <LabStage height={H}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, farmStyle]}>
          <ArtStill scene="farm" width={STAGE_W} height={H} attrs={{ season: 'autumn' }} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, porchStyle]}>
          <ArtStill
            scene="porch"
            width={STAGE_W}
            height={PORCH_H}
            attrs={{ state: 'empty', cast: `${GUEST},${HOST}` }}
          />
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, castStyle]}>
            {open ? (
              <ArtStill
                scene="porch"
                width={STAGE_W}
                height={PORCH_H}
                attrs={{ cast: `${GUEST},${HOST}` }}
              />
            ) : null}
          </Animated.View>
          {SEATS.map((id, i) => (
            <TravelSpot key={id} id={id} box={SEAT(i)} />
          ))}
          <TravelSpot
            id="lab:offstage"
            box={{ x: -160, y: PORCH_H * 0.7 - 120, width: 140, height: 140 }}
          />
          <TravelSpot
            id="lab:porch-door"
            box={{ x: STAGE_W * 0.8 - 30, y: PORCH_H * 0.42, width: 60, height: 60 }}
          />
        </Animated.View>
        <Animated.View
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, chatStyle]}
          pointerEvents="none"
        >
          <ChatPaper top={PORCH_H - 30}>
            <BlankBubble width={210} />
            <BlankBubble width={170} />
          </ChatPaper>
        </Animated.View>
      </LabStage>
      <LabNotes
        hint={t('motionLab.visit.hint')}
        actions={[
          { label: t('motionLab.visit.go'), onPress: visit },
          { label: t('motionLab.back'), onPress: back },
        ]}
      />
    </View>
  );
}
