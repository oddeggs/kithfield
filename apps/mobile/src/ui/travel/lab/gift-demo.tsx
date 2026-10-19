import { radii } from '@kithfield/theme';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo } from '../../motion/motion';
import { TravelSpot } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { timing } from '../timings';
import { LabNotes, LabStage, STAGE_W, useLabFlight } from './kit';

const H = 600;
const STAGE = { x: 28, y: 40, width: STAGE_W - 56, height: 300 };
const PARCEL = { width: 110, height: 96 };
const DOOR = { x: STAGE_W - 40 - 130, y: 380, width: 130, height: 170 };
/** On the door scene's step, where a parcel waits. */
const STEP = {
  x: DOOR.x + DOOR.width / 2 - 30,
  y: DOOR.y + DOOR.height * 0.86 - 50,
  width: 60,
  height: 52,
};
const FRIEND = 'owl';
const SCARF = { outfit: 'scarf', ocolor: '#c96f4f' };
/** The parcel scene shut (its lid opens later in its loop), in two drawings as it ties up. */
const parcelArt: SpriteSpec = {
  scene: 'gift',
  attrs: { color: '#d4704e' },
  width: PARCEL.width,
  height: PARCEL.height,
  at: 0.3,
  drawings: 2,
};
const total = timing('gift', 'total');

/**
 * A gift: the scarf wraps in two drawings, the parcel hops down the path to the friend's step,
 * and on their phone the lid lifts and the scarf drops onto their critter.
 */
export function GiftDemo() {
  const { t } = useLocale();
  const { go, current } = useLabFlight();
  const [given, setGiven] = useState(false);
  const step = useSharedValue(0);
  const theirs = useSharedValue(0);
  const doorStyle = useAnimatedStyle(() => ({ opacity: step.get() }));
  const yoursStyle = useAnimatedStyle(() => ({ opacity: 1 - theirs.get() }));
  const theirsStyle = useAnimatedStyle(() => ({ opacity: theirs.get() }));

  const wrap = () => {
    if (current.current) return;
    step.set(fadeTo(1));
    go({
      from: 'lab:wrap',
      to: 'lab:step',
      sprite: parcelArt,
      fromWidth: PARCEL.width,
      toWidth: STEP.width,
      hops: { count: 2, height: 30 },
      arc: 20,
      // It ties up where it is before it sets off.
      delayMs: total * 0.25,
      durationMs: total * 0.4,
      holdMs: total * 0.1,
      onLanded: () => {
        // On their phone: the lid lifts and the scarf drops onto them.
        setGiven(true);
        theirs.set(fadeTo(1));
      },
    });
  };

  const back = () => {
    if (current.current) return current.current.reverse();
    setGiven(false);
    theirs.set(fadeTo(0));
    step.set(fadeTo(0));
  };

  const stageBox = {
    position: 'absolute',
    left: STAGE.x,
    top: STAGE.y,
    width: STAGE.width,
    height: STAGE.height,
    borderTopLeftRadius: 150,
    borderTopRightRadius: 150,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#EFE2C8',
  } as const;

  return (
    <View>
      <LabStage height={H}>
        <Animated.View style={[stageBox, yoursStyle]}>
          <ArtStill
            scene="stage"
            width={STAGE.width}
            height={STAGE.height}
            attrs={{ kind: FRIEND }}
          />
        </Animated.View>
        <Animated.View style={[stageBox, theirsStyle]}>
          {given ? (
            <ArtStill
              scene="stage"
              width={STAGE.width}
              height={STAGE.height}
              attrs={{ kind: FRIEND, ...SCARF }}
            />
          ) : null}
        </Animated.View>
        <TravelSpot
          id="lab:wrap"
          box={{
            x: STAGE.x + STAGE.width / 2 - PARCEL.width / 2,
            y: STAGE.y + STAGE.height - PARCEL.height - 10,
            width: PARCEL.width,
            height: PARCEL.height,
          }}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: DOOR.x,
              top: DOOR.y,
              width: DOOR.width,
              height: DOOR.height,
              borderRadius: radii.tile,
              overflow: 'hidden',
            },
            doorStyle,
          ]}
        >
          <ArtStill scene="door" width={DOOR.width} height={DOOR.height} attrs={{ kind: FRIEND }} />
        </Animated.View>
        <TravelSpot id="lab:step" box={STEP} />
      </LabStage>
      <LabNotes
        hint={t('motionLab.gift.hint')}
        actions={[
          { label: t('motionLab.gift.go'), onPress: wrap },
          { label: t('motionLab.back'), onPress: back },
        ]}
      />
    </View>
  );
}
