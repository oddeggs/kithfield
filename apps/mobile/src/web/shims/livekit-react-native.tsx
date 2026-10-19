import type { Participant, Track, TrackPublication } from 'livekit-client';
import { createElement, useEffect, useRef } from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * `@livekit/react-native` in the browser, where `livekit-client` already speaks WebRTC: no
 * globals to register and no audio session to start, and a video track draws in a `<video>`.
 * Metro resolves the module here for web builds only (`metro.config.js`).
 */
export function registerGlobals(): void {
  // The browser has WebRTC built in.
}

export const AudioSession = {
  startAudioSession: (): Promise<void> => Promise.resolve(),
  stopAudioSession: (): Promise<void> => Promise.resolve(),
  showAudioRoutePicker: (): Promise<void> => Promise.resolve(),
};

export interface TrackReference {
  readonly participant: Participant;
  readonly publication: TrackPublication;
  readonly source: Track.Source;
}

export function VideoTrack({
  trackRef,
  objectFit = 'cover',
  mirror = false,
  style,
}: {
  readonly trackRef: TrackReference;
  readonly objectFit?: 'cover' | 'contain';
  readonly mirror?: boolean;
  readonly style?: ViewProps['style'];
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const track = trackRef.publication.track;
  useEffect(() => {
    const element = video.current;
    if (!track || !element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      {createElement('video', {
        ref: video,
        autoPlay: true,
        playsInline: true,
        muted: true,
        style: {
          width: '100%',
          height: '100%',
          objectFit,
          transform: mirror ? 'scaleX(-1)' : undefined,
        },
      })}
    </View>
  );
}
