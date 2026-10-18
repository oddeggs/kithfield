import { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtIcon, ArtStill } from '../../art/art-view';
import { YourBubble } from '../../components/bubble';
import { Button } from '../../components/button';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo, sheetTo } from '../../motion/motion';
import { Press } from '../../motion/press';
import { useReduceMotion } from '../../motion/reduce-motion';
import { useTheme } from '../../theme/theme-provider';
import { Txt } from '../../type/text';
import { TravelAnchor } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { timing } from '../timings';
import { useTravel, type FlightHandle } from '../travel-host';
import { BlankBubble, ChatPaper } from './kit';

const STAGE_H = 600;
const SEED = 72;
const seedArt: SpriteSpec = { scene: 'seed', attrs: { stage: 0 }, width: SEED, height: SEED };
/** Of the plant's 1.4 s: the bubble curls up for the first fifth, then the seed drops. */
const plant = timing('plantSeed', 'plant');
const CURL_MS = plant * 0.2;
const DROP_MS = plant * 0.45;

/**
 * Planting a seed: hold the message, it curls up into a seed that drops in an arc to the Seed bed
 * and settles there. Played back, it unplants: the seed flies back and the bubble uncurls.
 */
export function SeedDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const { fly } = useTravel();
  const flight = useRef<FlightHandle | null>(null);
  const [planted, setPlanted] = useState(false);
  // 1 while the bubble is a bubble; it curls toward 0 as the seed leaves.
  const bubble = useSharedValue(1);
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubble.get(),
    transform: [
      { scale: reduce ? 1 : 0.3 + 0.7 * bubble.get() },
      { rotate: `${(1 - bubble.get()) * -12}deg` },
    ],
  }));

  const plantIt = () => {
    if (flight.current || planted) return;
    bubble.set(reduce ? fadeTo(0) : sheetTo(0, false));
    // The seed bed already holds the seed, hidden until it lands there.
    setPlanted(true);
    flight.current = fly({
      from: 'lab:bubble',
      to: 'lab:seedbed',
      sprite: seedArt,
      fromWidth: SEED * 0.6,
      arc: 50,
      grow: 0.2,
      hideSource: false,
      delayMs: CURL_MS,
      durationMs: DROP_MS,
      onLanded: () => {
        flight.current = null;
      },
      onReturned: () => {
        flight.current = null;
        setPlanted(false);
        bubble.set(sheetTo(1, reduce));
      },
    });
  };

  const unplant = () => {
    if (flight.current) return flight.current.reverse();
    if (!planted) return;
    // Hidden while the seed flies out of it, the seed bed is empty again when it shows.
    setPlanted(false);
    flight.current = fly({
      from: 'lab:seedbed',
      to: 'lab:bubble',
      sprite: seedArt,
      toWidth: SEED * 0.6,
      arc: 50,
      hideSource: false,
      hideTarget: false,
      durationMs: DROP_MS,
      onLanded: () => {
        flight.current = null;
        bubble.set(sheetTo(1, reduce));
      },
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: STAGE_H, overflow: 'hidden', backgroundColor: palette.background }}>
        <ChatPaper top={0}>
          <BlankBubble width={220} />
          <BlankBubble width={170} />
          <Press onLongPress={plantIt} darken={false} style={{ alignSelf: 'flex-end' }}>
            <TravelAnchor id="lab:bubble">
              <Animated.View style={bubbleStyle}>
                <YourBubble>{t('motionLab.seed.message')}</YourBubble>
              </Animated.View>
            </TravelAnchor>
          </Press>
          <BlankBubble width={240} />
        </ChatPaper>
        <View
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            alignItems: 'center',
            gap: 4,
          }}
        >
          <TravelAnchor id="lab:seedbed" style={{ width: SEED, height: SEED }}>
            {planted ? (
              <ArtStill scene="seed" width={SEED} height={SEED} attrs={{ stage: 0 }} />
            ) : (
              <ArtIcon name="seeds" size={SEED} color={palette.tabInactive} />
            )}
          </TravelAnchor>
          <Txt variant="tab" color={palette.tabInactive}>
            {t('shell.tab.seedBed')}
          </Txt>
        </View>
      </View>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <Txt variant="note" multiline color={palette.secondary}>
          {t('motionLab.seed.hint')}
        </Txt>
        <Button label={t('motionLab.back')} kind="text" onPress={unplant} />
      </View>
    </View>
  );
}
