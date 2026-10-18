import { chatInks, viewerInks } from '@kithfield/theme';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { ArtIcon } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { Txt } from '../../../ui/type/text';
import { clock } from '../model/format';

const INK = viewerInks.ink;

/** A video in the viewer: muted until tapped, a play button, and a scrubber (04-13). */
export function VideoItem({
  url,
  width,
  height,
  active,
  durationMs,
}: {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  /** Only the page on screen plays. */
  readonly active: boolean;
  readonly durationMs?: number | undefined;
}) {
  const { t } = useLocale();
  const player = useVideoPlayer(url, (p) => {
    p.muted = true;
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState((durationMs ?? 0) / 1000);
  const [track, setTrack] = useState(0);

  useEffect(() => {
    const a = player.addListener('playingChange', (e) => setPlaying(e.isPlaying));
    const b = player.addListener('timeUpdate', (e) => {
      setTime(e.currentTime);
      if (player.duration > 0) setLength(player.duration);
    });
    return () => {
      a.remove();
      b.remove();
    };
  }, [player]);
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);

  const toggle = () => (playing ? player.pause() : player.play());
  const unmute = () => {
    player.muted = false;
    setMuted(false);
  };
  const seekTo = (fraction: number) => {
    const to = Math.max(0, Math.min(1, fraction)) * length;
    player.currentTime = to;
    setTime(to);
  };
  const scrub = usePanGesture({
    minDistance: 0,
    onUpdate: (e) => {
      'worklet';
      scheduleOnRN(seekTo, e.x / Math.max(1, track));
    },
  });
  const progress = length > 0 ? time / length : 0;

  return (
    <View style={{ width, height }}>
      <Press
        onPress={muted ? unmute : toggle}
        darken={false}
        accessibilityLabel={
          muted ? t('chat.viewer.unmute') : playing ? t('chat.viewer.pause') : t('chat.viewer.play')
        }
        style={{ flex: 1, justifyContent: 'center' }}
      >
        <VideoView
          player={player}
          style={{ width, height: Math.min(height, width * 1.2) }}
          contentFit="contain"
          nativeControls={false}
        />
      </Press>
      {!playing ? (
        <Press
          onPress={() => {
            unmute();
            player.play();
          }}
          radius={32}
          accessibilityLabel={t('chat.viewer.play')}
          style={{
            position: 'absolute',
            left: width / 2 - 32,
            top: height / 2 - 32,
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: chatInks.day.mediaScrim,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArtIcon name="play" size={26} color={viewerInks.thumb} />
        </Press>
      ) : null}
      <View
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 120,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Txt
          variant="bubbleState"
          color={INK}
          style={{ fontSize: 12.5, fontWeight: '500', fontVariant: ['tabular-nums'] }}
        >
          {clock(time * 1000)}
        </Txt>
        <GestureDetector gesture={scrub}>
          <View
            onLayout={(e: LayoutChangeEvent) => setTrack(e.nativeEvent.layout.width)}
            accessible
            accessibilityRole="adjustable"
            accessibilityValue={{ min: 0, max: Math.round(length), now: Math.round(time) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) =>
              seekTo(progress + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))
            }
            style={{ flex: 1, height: 24, justifyContent: 'center' }}
          >
            <View style={{ height: 4, borderRadius: 2, backgroundColor: viewerInks.track }}>
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${progress * 100}%`,
                  borderRadius: 2,
                  backgroundColor: INK,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: `${progress * 100}%`,
                  top: -5,
                  width: 14,
                  height: 14,
                  marginLeft: -7,
                  borderRadius: 7,
                  backgroundColor: viewerInks.thumb,
                }}
              />
            </View>
          </View>
        </GestureDetector>
        <Txt
          variant="bubbleState"
          color={INK}
          style={{ fontSize: 12.5, fontWeight: '500', fontVariant: ['tabular-nums'] }}
        >
          {clock(length * 1000)}
        </Txt>
      </View>
    </View>
  );
}
