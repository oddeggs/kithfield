import { radii } from '@kithfield/theme';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo, sheetTo } from '../../motion/motion';
import { useReduceMotion } from '../../motion/reduce-motion';
import { useTheme } from '../../theme/theme-provider';
import { TravelAnchor } from '../anchors';
import type { FlightHandle } from '../travel-host';
import { timing } from '../timings';
import { LabNotes, LabStage, STAGE_W, useLabFlight } from './kit';

const H = 600;
const CROP = 90;
/** The farm's patch, where the ripe crops stand (`S.farm`), and the basket they hop into. */
const PATCH = { x: STAGE_W * 0.78, y: H * 0.66 };
const CROPS = ['pumpkin', 'lavender', 'clover'] as const;
/** The storyboard's 150 ms between crops. */
const APART_MS = 150;
const BASKET = { x: STAGE_W / 2 - 110, y: 120, width: 220, height: 200 };
const RECAP_H = 230;
const total = timing('harvest', 'total');

const cropArt = (name: string) =>
  ({
    scene: 'plant',
    attrs: { name, stage: 4, color: 'none' },
    width: CROP,
    height: CROP,
  }) as const;

/**
 * Harvest: on Sunday the ripe crops hop out of the patch one by one into the basket, which
 * wobbles once as the last lands, and the recap sheet rises under it. Played back, the basket
 * goes home to the farm gate.
 */
export function HarvestDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const { fly } = useLabFlight();
  const [picked, setPicked] = useState(false);
  const flights = useRef<FlightHandle[]>([]);
  const page = useSharedValue(0);
  const recap = useSharedValue(0);
  const farmStyle = useAnimatedStyle(() => ({ opacity: 1 - page.get() }));
  const pageStyle = useAnimatedStyle(() => ({ opacity: page.get() }));
  const recapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - recap.get()) * (RECAP_H + 40) }],
  }));

  const harvest = () => {
    if (picked || flights.current.length > 0) return;
    flights.current = CROPS.map((name, i) =>
      fly({
        from: `lab:crop:${i}`,
        to: 'lab:basket',
        sprite: cropArt(name),
        toWidth: CROP * 0.6,
        hops: { count: 1, height: 30 },
        arc: 40,
        hideTarget: false,
        delayMs: i * APART_MS,
        durationMs: total * 0.45,
        fade: 'out',
        // Every crop's own drawing is hidden by its copy now: the patch can be emptied.
        ...(i === 0 ? { onStart: () => setPicked(true) } : {}),
        ...(i === CROPS.length - 1
          ? {
              onTouchdown: () => {
                page.set(fadeTo(1));
                // The basket wobbles once, then the recap rises under it.
                fly({
                  from: 'lab:basket',
                  to: 'lab:basket',
                  sprite: { scene: 'harvest', width: BASKET.width, height: BASKET.height },
                  arc: 0,
                  hideTarget: false,
                  hideSource: false,
                  durationMs: total * 0.2,
                  onTouchdown: () => recap.set(sheetTo(1, reduce)),
                });
              },
            }
          : {}),
      }),
    );
  };

  const back = () => {
    for (const f of flights.current) f.reverse();
    flights.current = [];
    setPicked(false);
    recap.set(sheetTo(0, reduce));
    page.set(fadeTo(0));
  };

  return (
    <View>
      <LabStage height={H}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, farmStyle]}>
          <ArtStill scene="farm" width={STAGE_W} height={H} attrs={{ season: 'autumn' }} />
        </Animated.View>
        {CROPS.map((name, i) => (
          <TravelAnchor
            key={name}
            id={`lab:crop:${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: PATCH.x - CROP + i * 34,
              top: PATCH.y - CROP + (i % 2) * 10,
              width: CROP,
              height: CROP,
            }}
          >
            {picked ? null : (
              <ArtStill
                scene="plant"
                width={CROP}
                height={CROP}
                attrs={{ name, stage: 4, color: 'none' }}
              />
            )}
          </TravelAnchor>
        ))}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              backgroundColor: palette.background,
            },
            pageStyle,
          ]}
        >
          <TravelAnchor
            id="lab:basket"
            style={{
              position: 'absolute',
              left: BASKET.x,
              top: BASKET.y,
              width: BASKET.width,
              height: BASKET.height,
            }}
          >
            <ArtStill scene="harvest" width={BASKET.width} height={BASKET.height} />
          </TravelAnchor>
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: RECAP_H,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
              backgroundColor: palette.sheet,
              boxShadow: palette.sheetShadow,
              padding: 22,
              gap: 12,
            },
            recapStyle,
          ]}
        >
          {[180, 260, 220].map((w) => (
            <View
              key={w}
              style={{ width: w, height: 12, borderRadius: 6, backgroundColor: palette.fillSoft }}
            />
          ))}
        </Animated.View>
      </LabStage>
      <LabNotes
        hint={t('motionLab.harvest.hint')}
        actions={[
          { label: t('motionLab.harvest.go'), onPress: harvest },
          { label: t('motionLab.back'), onPress: back },
        ]}
      />
    </View>
  );
}
