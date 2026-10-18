import type { VoicePayload } from '@kithfield/contracts';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useMediaUrl } from '../../media';
import { clock } from '../model/format';
import type { BubbleItem } from '../model/timeline';
import { useChatColours } from '../ui/chat-colours';

/** Bars a voice note's waveform is drawn with, from its levels. */
export const VOICE_BARS = 18;

/** The shortest and tallest bar, as the design draws a note's waveform. */
const BAR_MIN = 5;
const BAR_MAX = 22;

/** Levels (0–255) to `count` bar heights between 5 and `max` points. */
export function barsOf(levels: readonly number[], count: number, max = BAR_MAX): number[] {
  if (levels.length === 0) return Array.from({ length: count }, () => BAR_MIN);
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * levels.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / count));
    const slice = levels.slice(from, to);
    const level = Math.max(...slice);
    return Math.round(BAR_MIN + (level / 255) * (max - BAR_MIN));
  });
}

/** One voice note plays at a time, everywhere in the app. */
let playing: { owner: string; player: AudioPlayer; stop: () => void } | null = null;

/** A voice note: play, its waveform filling as it plays, and how long it is. */
export function VoiceBubble({
  item,
  voice,
}: {
  readonly item: BubbleItem;
  readonly voice: VoicePayload;
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const [progress, setProgress] = useState(0);
  const [on, setOn] = useState(false);
  const mine = item.mine && item.delivery !== 'failed';
  const ink = mine ? palette.bubble.yoursFg : colours.wave;
  const rest = mine ? colours.mentionMineBg : colours.waveRest;
  const bars = barsOf(voice.waveform, VOICE_BARS);
  // Your own note plays from the phone while it is going up; anyone's from a signed read.
  const url = useMediaUrl(voice.audio.key === '' ? null : voice.audio.key);

  // Leaving the chat stops what it was playing.
  useEffect(
    () => () => {
      if (playing?.owner === item.key) playing.stop();
    },
    [item.key],
  );

  const toggle = async () => {
    if (on && playing) {
      playing.stop();
      return;
    }
    playing?.stop();
    if (url === null) return;
    await setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    const player = createAudioPlayer({ uri: url });
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      const total = s.duration > 0 ? s.duration : voice.durationMs / 1000;
      setProgress(Math.min(1, s.currentTime / total));
      if (s.didJustFinish) stop();
    });
    const stop = () => {
      sub.remove();
      player.pause();
      player.release();
      if (playing?.player === player) playing = null;
      setOn(false);
      setProgress(0);
    };
    playing = { owner: item.key, player, stop };
    setOn(true);
    player.play();
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingLeft: 8,
        paddingRight: 14,
      }}
    >
      <Press
        onPress={() => void toggle()}
        radius={16}
        haptic="tap"
        accessibilityLabel={on ? t('chat.bubble.pause') : t('chat.bubble.play')}
        hitSlop={6}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colours.play,
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: on ? 0 : 2,
        }}
      >
        <Txt variant="caption" color={palette.text} style={{ fontSize: 12 }}>
          {on ? '❚❚' : '▶'}
        </Txt>
      </Press>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 24 }}
        importantForAccessibility="no-hide-descendants"
      >
        {bars.map((h, i) => (
          <View
            key={i}
            style={{
              width: 3,
              height: h,
              borderRadius: 2,
              // Played (and, at rest, all) bars in ink; those still to play lighter.
              backgroundColor: on && i / bars.length > progress ? rest : ink,
            }}
          />
        ))}
      </View>
      <Txt
        variant="bubbleState"
        color={mine ? palette.bubble.yoursFg : palette.secondary}
        style={{ fontSize: 12.5, fontWeight: '500', fontVariant: ['tabular-nums'] }}
      >
        {clock(on ? voice.durationMs * (1 - progress) : voice.durationMs)}
      </Txt>
    </View>
  );
}
