import { radii } from '@kithfield/theme';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ArtStill } from '../../art/art-view';
import { useLocale } from '../../locale/locale-provider';
import { sheetTo } from '../../motion/motion';
import { Press } from '../../motion/press';
import { useReduceMotion } from '../../motion/reduce-motion';
import { useTheme } from '../../theme/theme-provider';
import { TravelAnchor } from '../anchors';
import type { SpriteSpec } from '../sprite';
import { timing } from '../timings';
import { BlankBubble, ChatPaper, LabNotes, LabStage, useLabFlight } from './kit';

const PICKED = 100;
const SENT = 140;
const PICKER_H = 300;
const POSES = ['wave', 'hug', 'love'] as const;
const LOOK = { kind: 'rabbit', outfit: 'scarf', ocolor: '#5E7F4A' };
const stickerArt = (pose: string, size: number): SpriteSpec => ({
  scene: 'sticker',
  attrs: { ...LOOK, pose },
  width: size,
  height: size,
  drawings: 2,
});
const total = timing('sticker', 'total');

/**
 * A sticker grows from the picker into a message: it lifts, tilts and grows along an arc, and
 * lands as a message with a two-drawing bounce while the picker drops away.
 */
export function StickerDemo() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const { go, current } = useLabFlight();
  const [sent, setSent] = useState<string | null>(null);
  const picker = useSharedValue(1);
  useEffect(() => {
    picker.set(sheetTo(sent ? 0 : 1, reduce));
  }, [sent, reduce, picker]);
  const pickerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - picker.get()) * (PICKER_H + 40) }],
  }));

  const send = (pose: string) => {
    if (current.current) return;
    go({
      from: `lab:sticker:${pose}`,
      to: 'lab:sent',
      sprite: stickerArt(pose, SENT),
      grow: 0.15,
      arc: 70,
      hideSource: false,
      durationMs: total,
      // The message holds it from the moment it lifts, hidden until it lands.
      onStart: () => setSent(pose),
    });
  };

  return (
    <View>
      <LabStage>
        <ChatPaper top={0}>
          <BlankBubble width={220} />
          <BlankBubble width={170} />
          <TravelAnchor
            id="lab:sent"
            style={{ alignSelf: 'flex-end', width: SENT, height: SENT }}
            {...(sent ? { sprite: stickerArt(sent, SENT) } : {})}
          >
            {sent ? (
              <ArtStill
                scene="sticker"
                width={SENT}
                height={SENT}
                attrs={{ ...LOOK, pose: sent }}
              />
            ) : null}
          </TravelAnchor>
        </ChatPaper>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: PICKER_H,
              borderTopLeftRadius: radii.sheet,
              borderTopRightRadius: radii.sheet,
              backgroundColor: palette.sheet,
              boxShadow: palette.sheetShadow,
              padding: 20,
              flexDirection: 'row',
              justifyContent: 'space-between',
            },
            pickerStyle,
          ]}
        >
          {POSES.map((pose) => (
            <Press
              key={pose}
              onPress={() => send(pose)}
              darken={false}
              accessibilityLabel={t('motionLab.sticker')}
            >
              <TravelAnchor id={`lab:sticker:${pose}`}>
                <ArtStill
                  scene="sticker"
                  width={PICKED}
                  height={PICKED}
                  attrs={{ ...LOOK, pose }}
                />
              </TravelAnchor>
            </Press>
          ))}
        </Animated.View>
      </LabStage>
      <LabNotes
        hint={t('motionLab.sticker.hint')}
        actions={[{ label: t('motionLab.back'), onPress: () => setSent(null) }]}
      />
    </View>
  );
}
