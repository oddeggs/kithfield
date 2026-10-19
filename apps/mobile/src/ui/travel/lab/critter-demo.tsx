import { radii } from '@kithfield/theme';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { Avatar } from '../../art/avatar';
import { Button } from '../../components/button';
import { useLocale } from '../../locale/locale-provider';
import { fadeTo, sheetTo } from '../../motion/motion';
import { Press } from '../../motion/press';
import { useReduceMotion } from '../../motion/reduce-motion';
import { useTheme } from '../../theme/theme-provider';
import { Txt } from '../../type/text';
import { TravelAnchor } from '../anchors';
import { timing } from '../timings';
import { useTravel, type FlightHandle } from '../travel-host';
import { BlankBubble, ChatPaper, poseOf, StandingCritter } from './kit';

const FARM_H = 300;
const CARD_H = 150;
const STAGE_H = 600;
const CRITTER = 110;
/** Who stands where on the farm, feet first. */
const CAST = [
  { kind: 'sheep', x: 90, y: 250 },
  { kind: 'frog', x: 200, y: 268 },
  { kind: 'hedgehog', x: 305, y: 250 },
] as const;
const FACE = 30;
/** The face is drawn at the size it swells to, so it never blurs. */
const FACE_DRAWN = 76;
const out = timing('critterTravel', 'out');
const back = timing('critterTravel', 'back');

const faceId = (kind: string) => `lab:face:${kind}`;
const critterId = (kind: string) => `lab:critter:${kind}`;

/**
 * A critter travels: tap a face on a bubble, it lifts and swells, arcs into the farm and lands
 * as the whole critter, then their card rises under it. Played back, it shrinks into the bubble.
 */
export function CritterDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const { fly } = useTravel();
  const flight = useRef<FlightHandle | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const dim = useSharedValue(0);
  const rise = useSharedValue(0);
  useEffect(() => {
    rise.set(sheetTo(card ? 1 : 0, reduce));
  }, [card, reduce, rise]);
  const chatStyle = useAnimatedStyle(() => ({ opacity: 1 - dim.get() * 0.5 }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: reduce ? rise.get() : 1,
    transform: [{ translateY: (1 - rise.get()) * (CARD_H + 40) }],
  }));

  const go = (kind: string) => {
    // A second tap mid-flight goes straight to the card.
    if (flight.current) return flight.current.finish();
    if (card) return;
    dim.set(fadeTo(1));
    flight.current = fly({
      from: faceId(kind),
      to: critterId(kind),
      sprite: { avatar: kind, size: FACE_DRAWN },
      morph: true,
      grow: 0.35,
      arc: 70,
      durationMs: out,
      backMs: back,
      onLanded: () => {
        flight.current = null;
        setCard(kind);
      },
      onReturned: () => {
        flight.current = null;
        dim.set(fadeTo(0));
      },
    });
  };

  const playBack = () => {
    if (flight.current) return flight.current.reverse();
    if (!card) return;
    const kind = card;
    setCard(null);
    flight.current = fly({
      from: critterId(kind),
      to: faceId(kind),
      sprite: poseOf(kind, CRITTER),
      becomes: { avatar: kind, size: FACE },
      fit: 1,
      toWidth: FACE * 1.4,
      arc: 70,
      durationMs: back,
      onLanded: () => {
        flight.current = null;
        dim.set(fadeTo(0));
      },
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: STAGE_H, overflow: 'hidden' }}>
        <ArtStill scene="farm" width={393} height={FARM_H} attrs={{ state: 'nocast' }} />
        {CAST.map((c) => (
          <StandingCritter
            key={c.kind}
            id={critterId(c.kind)}
            kind={c.kind}
            x={c.x}
            y={c.y}
            size={CRITTER}
          />
        ))}
        <Animated.View
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, chatStyle]}
        >
          <ChatPaper top={FARM_H - 20}>
            {CAST.map((c, i) => (
              <View key={c.kind} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <Press onPress={() => go(c.kind)} darken={false} radius={FACE / 2} hitSlop={8}>
                  <TravelAnchor id={faceId(c.kind)} sprite={{ avatar: c.kind, size: FACE }}>
                    <Avatar kind={c.kind} size={FACE} label={t('motionLab.critter')} />
                  </TravelAnchor>
                </Press>
                <BlankBubble width={[220, 170, 240][i] ?? 200} />
              </View>
            ))}
          </ChatPaper>
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: CARD_H,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
              backgroundColor: palette.sheet,
              boxShadow: palette.sheetShadow,
              padding: 22,
            },
            cardStyle,
          ]}
        >
          <Txt variant="sheetTitle">{t('motionLab.critter.card')}</Txt>
        </Animated.View>
      </View>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <Txt variant="note" multiline color={palette.secondary}>
          {t('motionLab.critter.hint')}
        </Txt>
        <Button label={t('motionLab.back')} kind="text" onPress={playBack} />
      </View>
    </View>
  );
}
