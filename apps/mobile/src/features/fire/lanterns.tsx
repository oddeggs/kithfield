import { VideoTrack } from '@livekit/react-native';
import type { Critter } from '@kithfield/contracts';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { type Participant, type Room, Track } from 'livekit-client';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { ArtStill } from '../../ui/art/art-view';
import { sceneLook } from '../../ui/art/critter-look';
import { useLocale } from '../../ui/locale/locale-provider';
import { fadeTo, sheetTo } from '../../ui/motion/motion';
import { Press } from '../../ui/motion/press';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import { FIRE_TEXT_MAX_SCALE, LevelBars } from './fire-chrome';
import { FireTxt } from './fire-text';
import { fireLook } from './look';
import { frameSpeech, type Layout } from './room-model';

/*
 * Lanterns: video by the fire, in round hand-drawn frames. Off by default; someone with their
 * camera off shows as their critter in the same frame, and nobody is shamed for it beyond the
 * name chip. Two people get big frames, three or four a 2×2 grid, more sit in frames round the
 * fire. A lit frame has a tiny lantern on its rim; swapping video and critter cross-fades.
 */

export interface LanternPerson {
  readonly id: string;
  readonly name: string;
  readonly you: boolean;
  readonly critter: Critter | null;
  readonly lantern: boolean;
  readonly mic: boolean;
  readonly speaking: boolean;
  readonly level: SharedValue<number>;
}

/** Where frames sit, by layout, in the design's 393×852 points: left, top and size. */
const PAIR = [
  { x: 22, y: 202, s: 176 },
  { x: 196, y: 202, s: 176 },
];
const GRID = [
  { x: 37, y: 139, s: 150 },
  { x: 207, y: 139, s: 150 },
  { x: 37, y: 309, s: 150 },
  { x: 207, y: 309, s: 150 },
];
/** Round the fire, clockwise from the top. */
const RING = Array.from({ length: 8 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI * 2) / 8;
  return {
    x: 196 + Math.cos(a) * 98 * (i % 2 ? 1.0 : 1) - 38,
    y: 515 + Math.sin(a) * 96 - 38,
    s: 76,
  };
});

/** The frame's ring colour when the camera is off. */
const DARK_RING = fireLook.frameDark;

function trackOf(p: Participant, source: Track.Source) {
  const publication = p.getTrackPublication(source);
  if (!publication || !publication.track || publication.isMuted) return undefined;
  return { participant: p, publication, source };
}

export function LanternFrame({
  person,
  participant,
  x,
  y,
  size,
  onPress,
}: {
  readonly person: LanternPerson;
  readonly participant: Participant | null;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly onPress?: () => void;
}) {
  const { t } = useLocale();
  // At the accessibility sizes the name chip takes two lines, held to twice its size so it doesn't
  // cover the frame; a long press on it shows the name whole.
  const ax = useAccessibilitySize();
  const inset = size >= 150 ? (size >= 170 ? 9 : 8) : 4;
  const video =
    participant && person.lantern ? trackOf(participant, Track.Source.Camera) : undefined;
  const shown = useSharedValue(video ? 1 : 0);
  useEffect(() => {
    shown.set(fadeTo(video ? 1 : 0));
  }, [video, shown]);
  const videoStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const inner = size - inset * 2;
  const name = person.you
    ? person.lantern
      ? t('fire.chip.you')
      : t('fire.chip.youCameraOff')
    : person.name;
  const talking = person.speaking;
  // Who it is and how: talking or muted, lantern lit or camera off.
  const speech = frameSpeech(t, person);
  const frame = (
    <View
      style={{ position: 'absolute', left: x, top: y, width: size, height: size, zIndex: 8 }}
      {...(onPress ? {} : { accessible: true, accessibilityLabel: speech })}
    >
      <View
        style={{
          position: 'absolute',
          left: inset,
          top: inset,
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          overflow: 'hidden',
        }}
      >
        {person.critter ? (
          <ArtStill
            scene="solo"
            width={inner}
            height={inner}
            attrs={{ ...sceneLook(person.critter), items: talking ? 'talk:' : ':' }}
          />
        ) : null}
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, width: inner, height: inner },
            videoStyle,
          ]}
        >
          {video ? (
            <VideoTrack
              trackRef={video}
              objectFit="cover"
              mirror={person.you}
              style={{ width: inner, height: inner }}
            />
          ) : null}
        </Animated.View>
      </View>
      <ArtStill
        scene="lframe"
        width={size}
        height={size}
        attrs={person.lantern ? {} : { state: 'plain', color: DARK_RING }}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -6,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}
      >
        <View
          accessibilityShowsLargeContentViewer
          accessibilityLargeContentTitle={name}
          style={{
            ...(ax ? { minHeight: 22, paddingVertical: 2, maxWidth: '100%' } : { height: 22 }),
            paddingHorizontal: 8,
            borderRadius: 11,
            backgroundColor: talking ? fireLook.talking : fireLook.card,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {talking ? <LevelBars level={person.level} color={fireLook.talkingInk} /> : null}
          {person.you && !person.lantern && !person.mic ? (
            <ArtStill
              scene="icon"
              width={12}
              height={12}
              attrs={{ name: 'muted', color: fireLook.text }}
            />
          ) : null}
          <FireTxt
            variant="buttonSmall"
            color={talking ? fireLook.talkingInk : fireLook.text}
            {...(ax ? { numberOfLines: 2 } : {})}
            maxFontSizeMultiplier={FIRE_TEXT_MAX_SCALE}
            style={[{ fontSize: 11.5, lineHeight: 13 }, ax ? { flexShrink: 1 } : null]}
          >
            {name}
          </FireTxt>
        </View>
      </View>
    </View>
  );
  if (!onPress) return frame;
  return (
    <Press onPress={onPress} darken={false} accessibilityLabel={speech} accessibilityRole="button">
      {frame}
    </Press>
  );
}

/** The frames for everyone by the fire, laid out for how many there are. */
export function Lanterns({
  layout,
  people,
  room,
  scale,
  onYourFrame,
}: {
  readonly layout: Layout;
  readonly people: readonly LanternPerson[];
  readonly room: Room;
  /** The screen's width over the design's 393 points. */
  readonly scale: number;
  readonly onYourFrame: () => void;
}) {
  const { t } = useLocale();
  const spots = layout.kind === 'pair' ? PAIR : layout.kind === 'grid' ? GRID : RING;
  // In a pair you sit on the right, as the design draws it; elsewhere people keep their order.
  const ordered =
    layout.kind === 'pair'
      ? [...people.filter((p) => !p.you), ...people.filter((p) => p.you)]
      : people;
  const participantOf = (id: string): Participant | null =>
    id === room.localParticipant.identity
      ? room.localParticipant
      : (room.remoteParticipants.get(id) ?? null);
  const lit = people.find((p) => p.lantern && !p.you);
  const you = people.find((p) => p.you);
  return (
    <>
      {layout.kind === 'ring' ? null : (
        <Canvas
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 393 * scale,
            height: 480 * scale,
            zIndex: 5,
          }}
        >
          <Rect x={0} y={0} width={393 * scale} height={480 * scale}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, 480 * scale)}
              colors={[...fireLook.lanternScrim]}
              positions={[0, 0.7, 1]}
            />
          </Rect>
        </Canvas>
      )}
      {ordered.slice(0, spots.length).map((p, i) => {
        const spot = spots[i];
        if (!spot) return null;
        return (
          <LanternFrame
            key={p.id}
            person={p}
            participant={participantOf(p.id)}
            x={spot.x * scale}
            y={spot.y * scale}
            size={spot.s * scale}
            {...(p.you && p.lantern ? { onPress: onYourFrame } : {})}
          />
        );
      })}
      {layout.kind === 'pair' && lit && you && !you.lantern ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 24, right: 24, top: 410 * scale, zIndex: 7 }}
        >
          <FireTxt
            variant="handL"
            color={fireLook.glyph}
            align="center"
            multiline
            style={{ fontSize: 16, lineHeight: 19.2 }}
          >
            {t('fire.lantern.welcome', { name: lit.name, you: you.name })}
          </FireTxt>
        </View>
      ) : null}
    </>
  );
}

/** A screen shared by the fire, in a big hand-drawn card; it rises on the sheet spring. */
export function ShareCard({
  participant,
  scale,
}: {
  readonly participant: Participant;
  readonly scale: number;
}) {
  const reduce = useReduceMotion();
  const rise = useSharedValue(0);
  useEffect(() => {
    rise.set(sheetTo(1, reduce));
  }, [rise, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: reduce ? rise.get() : 1,
    transform: [{ translateY: (1 - rise.get()) * 60 }],
  }));
  const screen = trackOf(participant, Track.Source.ScreenShare);
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 14 * scale,
          right: 14 * scale,
          top: 122 * scale,
          height: 360 * scale,
          borderRadius: 28,
          borderWidth: 4,
          borderColor: fireLook.frameLit,
          backgroundColor: fireLook.paper,
          overflow: 'hidden',
          zIndex: 9,
        },
        style,
      ]}
    >
      {screen ? <VideoTrack trackRef={screen} objectFit="contain" style={{ flex: 1 }} /> : null}
    </Animated.View>
  );
}
