import { LIMITS } from '@kithfield/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, View, useWindowDimensions } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { LayeredScene } from '../../ui/art/layered-scene';
import { Button } from '../../ui/components/button';
import { TextField } from '../../ui/components/text-field';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { timing, useTravel } from '../../ui/travel';
import { Txt } from '../../ui/type/text';
import { defaultFriend, friendsOf } from './model/people';
import { useGestureSend } from './send';
import { DoorPicker, type DoorPickerHandle } from './ui/door-picker';
import { leave } from './ui/presentation';
import { SceneScreen } from './ui/scene-screen';
import { one, useGestureFarm } from './use-gesture-farm';

const ART_H = 430;
const SHEET_TOP = 392;
/** The firefly as it leaves the button and as it waits on the step. */
const FIREFLY = 36;

/**
 * Leave a firefly on a doorstep: pick a door, add a few words if you like, and it drifts
 * to that door and waits there until they open the app. A `firefly {action: left}` write.
 */
export function FireflyScreen() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ to?: string }>();
  const g = useGestureFarm();
  const send = useGestureSend(g.farm);
  const friends = friendsOf(g.state, g.me);
  const [picked, setPicked] = useState<string | null>(() =>
    defaultFriend(g.state, g.me, one(params.to)),
  );
  const [words, setWords] = useState('');
  const { width, height } = useWindowDimensions();
  const [flying, setFlying] = useState(false);
  const travel = useTravel();
  const doors = useRef<DoorPickerHandle>(null);
  const chosen = picked ?? defaultFriend(g.state, g.me, one(params.to));
  const friend = g.friend(chosen);
  const name = friend?.name ?? t('gestures.aFriend');

  const go = async () => {
    if (!chosen || flying) return;
    const trimmed = words.trim();
    const ok = await send(
      'firefly',
      { action: 'left', to: chosen, ...(trimmed ? { words: trimmed } : {}) },
      { haptic: 'soft', sent: t('gestures.sent.firefly', { name }), icon: 'firefly' },
    );
    if (!ok) return;
    // The keyboard goes first, so the firefly flies to where the door rests.
    await keyboardGone();
    const rect = await doors.current?.measurePicked();
    if (!rect) return leave();
    setFlying(true);
    // It rises from the button and drifts to the door it was left at, in the overlay over this
    // screen, and the screen closes as it settles.
    const spot = (x: number, y: number) => ({
      x: x - FIREFLY / 2,
      y: y - FIREFLY / 2,
      width: FIREFLY,
      height: FIREFLY,
    });
    travel.fly({
      from: spot(width / 2, height - 62),
      to: spot(rect.x + rect.width / 2, rect.y + rect.height * 0.8),
      sprite: { scene: 'icon', attrs: { name: 'firefly' }, width: 56, height: 56 },
      arc: 120,
      grow: 0.2,
      durationMs: timing('firefly', 'flight'),
      onLanded: () => leave(),
    });
  };

  return (
    <SceneScreen
      art={(width) => (
        <LayeredScene
          scene="farm"
          width={width}
          height={ART_H}
          attrs={{ season: g.season, night: true, firefly: true, lit: friend?.kind ?? '' }}
        />
      )}
      artHeight={ART_H}
      sheetTop={SHEET_TOP}
      tone="night"
      padding={16}
      footer={
        <Button
          label={t('gestures.firefly.send')}
          kind="light"
          disabled={!chosen || flying}
          onPress={() => void go()}
        />
      }
    >
      <View style={{ paddingHorizontal: 4 }}>
        <Txt variant="displayM" accessibilityRole="header" style={{ lineHeight: 28.6 }}>
          {t('gestures.firefly.title')}
        </Txt>
        <Txt
          variant="body"
          color={palette.body}
          style={{ fontSize: 14.5, lineHeight: 18.85, marginTop: 3 }}
        >
          {t('gestures.doors.pick')}
        </Txt>
      </View>
      {friends.length === 0 ? (
        <Txt variant="caption" multiline color={palette.secondary}>
          {t('gestures.doors.nobody')}
        </Txt>
      ) : (
        <DoorPicker friends={friends} picked={chosen} onPick={setPicked} lit ref={doors} />
      )}
      <View
        accessible
        style={{
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 16,
          backgroundColor: palette.firefly.bg,
        }}
      >
        <ArtIcon name="firefly" size={34} color={palette.firefly.fg} />
        <Txt
          variant="body"
          multiline
          color={palette.firefly.fg}
          style={{ flex: 1, fontSize: 14, lineHeight: 18.9 }}
        >
          {chosen ? t('gestures.firefly.note', { name }) : t('gestures.firefly.pickFirst')}
        </Txt>
      </View>
      <TextField
        value={words}
        onChangeText={setWords}
        maxLength={LIMITS.fireflyWords}
        placeholder={t('gestures.firefly.words')}
        returnKeyType="done"
        testID="firefly-words"
      />
    </SceneScreen>
  );
}

/** Waits for the keyboard to finish leaving, if it is showing. */
function keyboardGone(): Promise<void> {
  if (!Keyboard.isVisible()) return Promise.resolve();
  return new Promise((resolve) => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      sub.remove();
      resolve();
    });
    Keyboard.dismiss();
  });
}
