import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ArtStill } from '../../ui/art/art-view';
import { Button } from '../../ui/components/button';
import { Card } from '../../ui/components/card';
import { useLocale } from '../../ui/locale/locale-provider';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { defaultFriend, friendsOf } from './model/people';
import { useGestureSend } from './send';
import { DoorPicker } from './ui/door-picker';
import { SceneScreen } from './ui/scene-screen';
import { one, useGestureFarm } from './use-gesture-farm';

const ART_H = 450;
const SHEET_TOP = 420;
/** The door row, when the screen wasn't told whose window: the sheet rises to make room. */
const PICKER_H = 104;
/** Where "knock knock" sits on the window scene: by the frame's upper right, as a share of it. */
const KNOCK_AT = { left: '66.7%', top: '21.3%' } as const;
/** The window's wobble: 3 swings of ±4° over 600 ms. */
const SWING_DEG = 4;
const SWING_MS = 600 / 6;

/**
 * Knock on a friend's window: their critter wobbles once on their home screen. No sound,
 * no badge, and never a missed-call push; one knock per friend per farm day. A `knock` write.
 */
export function KnockScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const params = useLocalSearchParams<{ to?: string }>();
  const g = useGestureFarm();
  const send = useGestureSend(g.farm);
  const [picked, setPicked] = useState<string | null>(null);
  const to = picked ?? defaultFriend(g.state, g.me, one(params.to));
  const friend = g.friend(to);
  const name = friend?.name ?? t('gestures.aFriend');
  const kind = friend?.kind ?? 'hedgehog';
  const dozing = g.view?.critters.find((c) => c.person === to)?.sleepy ?? false;
  // One knock per friend per farm day: the farm's rule, asked as a dry run.
  const check = to ? g.can({ kind: 'knock', payload: { to } }) : null;
  const done = check !== null && !check.ok;

  const tilt = useSharedValue(0);
  const wobble = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }] }));

  const knock = async () => {
    if (!to || done) return;
    const ok = await send(
      'knock',
      { to },
      { haptic: 'tap', sent: t('gestures.sent.knock', { name }), icon: 'door' },
    );
    if (!ok || reduce) return;
    const swing = (deg: number) =>
      withTiming(deg, { duration: SWING_MS, reduceMotion: ReduceMotion.Never });
    tilt.set(
      withSequence(
        swing(SWING_DEG),
        swing(-SWING_DEG),
        swing(SWING_DEG),
        swing(-SWING_DEG),
        swing(SWING_DEG / 2),
        swing(0),
      ),
    );
  };

  const friends = friendsOf(g.state, g.me);
  const picking = one(params.to) === undefined && g.state?.kind !== 'visit';
  return (
    <SceneScreen
      art={(width) => (
        <Animated.View style={[{ transformOrigin: 'center 30%' }, wobble]}>
          <ArtStill scene="window" width={width} height={ART_H} attrs={{ kind }} />
        </Animated.View>
      )}
      artHeight={ART_H}
      sheetTop={picking ? SHEET_TOP - PICKER_H : SHEET_TOP}
      tone="night"
      title={to ? t('gestures.knock.window', { name }) : t('gestures.knock.pick')}
      overArt={
        // Beside the window's upper right edge, wherever the window is drawn; it wraps rather than
        // running off the screen when the text is large.
        <View style={{ position: 'absolute', left: KNOCK_AT.left, top: KNOCK_AT.top, right: 8 }}>
          <Txt
            variant="handL"
            multiline
            color="#f6eedb"
            style={{ transform: [{ rotate: '8deg' }], transformOrigin: 'left center' }}
          >
            {t('gestures.knock.sound')}
          </Txt>
        </View>
      }
    >
      {picking ? <DoorPicker friends={friends} picked={to} onPick={setPicked} /> : null}
      <Txt variant="displayM" multiline accessibilityRole="header" style={{ lineHeight: 28.6 }}>
        {t('gestures.knock.title', { name })}
      </Txt>
      <Txt variant="sheetBody" multiline color={palette.body}>
        {dozing ? t('gestures.knock.bodyDozing', { name }) : t('gestures.knock.body', { name })}
      </Txt>
      <Card style={{ padding: 10, paddingVertical: 10, paddingHorizontal: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 96, height: 96, borderRadius: 22, overflow: 'hidden' }}>
            <ArtStill scene="window" width={96} height={96} attrs={{ kind }} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="rowTitle" multiline style={{ fontSize: 15, lineHeight: 18 }}>
              {t('gestures.knock.previewTitle', { name })}
            </Txt>
            <Txt
              variant="planDetail"
              multiline
              color={palette.secondary}
              style={{ lineHeight: 19.17 }}
            >
              {t('gestures.knock.previewBody')}
            </Txt>
          </View>
        </View>
      </Card>
      <Button
        label={t('gestures.knock.send')}
        kind="primary"
        disabled={!to || done}
        onPress={() => void knock()}
      />
      <Txt
        variant="note"
        multiline
        align="center"
        color={palette.secondary}
        style={{ fontSize: 13, lineHeight: 18.46 }}
      >
        {done ? t('gestures.knock.done') : t('gestures.knock.once')}
      </Txt>
    </SceneScreen>
  );
}
