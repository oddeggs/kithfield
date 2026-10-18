import { isTombstone, type PersonId } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useDataClient } from '../../../data';
import { ArtIcon } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { Sheet, SheetScrollView } from '../../../ui/components/sheet';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { lookOf } from '../model/people';
import type { BubbleItem } from '../model/timeline';
import { useChatColours } from '../ui/chat-colours';
import { useRoom } from './room-context';

/** A pinned message as the board shows it. */
export interface Pinned {
  readonly seq: number;
  readonly actor: PersonId | null;
  readonly text: string;
}

const textOf = (kind: string, payload: unknown): string => {
  if (isTombstone(payload) || typeof payload !== 'object' || payload === null) return '';
  const p = payload as Record<string, unknown>;
  const text =
    p['text'] ??
    p['caption'] ??
    (p['preview'] as Record<string, unknown> | undefined)?.['title'] ??
    p['url'];
  return typeof text === 'string' ? text : kind;
};

/** The farm's pins, newest first, from the timeline or the phone's cache. */
export function usePinned(
  farm: string,
  pins: readonly number[],
  bubbleAt: (seq: number) => BubbleItem | null,
): Pinned[] {
  const client = useDataClient();
  const key = pins.join(',');
  const [loaded, setLoaded] = useState<Readonly<Record<number, Pinned>>>({});
  useEffect(() => {
    let live = true;
    const missing = pins.filter((seq) => bubbleAt(seq) === null && loaded[seq] === undefined);
    if (missing.length === 0) return;
    void Promise.all(missing.map((seq) => client.store.event(farm, seq))).then((events) => {
      if (!live) return;
      const next: Record<number, Pinned> = {};
      for (const e of events) {
        if (e) next[e.seq] = { seq: e.seq, actor: e.actor, text: textOf(e.kind, e.payload) };
      }
      setLoaded((l) => ({ ...l, ...next }));
    });
    return () => {
      live = false;
    };
    // Reloads when the set of pins changes.
  }, [client, farm, key]);
  return [...pins]
    .reverse()
    .map((seq) => {
      const b = bubbleAt(seq);
      if (b) {
        const text =
          b.body.kind === 'message' || b.body.kind === 'quiet_note'
            ? b.body.text
            : b.body.kind === 'link'
              ? (b.body.link.preview?.title ?? b.body.link.url)
              : b.body.kind === 'media'
                ? (b.body.media.caption ?? '')
                : '';
        return { seq, actor: b.actor, text };
      }
      return loaded[seq] ?? null;
    })
    .filter((p): p is Pinned => p !== null);
}

/** The strip under the header: "3 pinned" and the newest pin. */
export function PinBar({
  pinned,
  onPress,
}: {
  readonly pinned: readonly Pinned[];
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const newest = pinned[0];
  if (!newest) return null;
  const count = t('chat.pins.bar', { count: pinned.length });
  return (
    <Press
      onPress={onPress}
      darken={false}
      accessibilityLabel={`${count}: ${newest.text}`}
      style={{
        height: 46,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
      }}
    >
      <ArtIcon name="pin" size={18} color={colours.mentionFg} />
      <Txt variant="rowTitle" style={{ fontSize: 14 }}>
        {count}
      </Txt>
      <Txt
        variant="caption"
        color={palette.secondary}
        numberOfLines={1}
        style={{ flex: 1, fontSize: 14 }}
      >
        {newest.text}
      </Txt>
    </Press>
  );
}

const TILTS = [-2, 2.5, 1.5, -1.5, 2, -2.5] as const;

function Cork({ width, height }: { readonly width: number; readonly height: number }) {
  const colours = useChatColours();
  const dots = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    for (let y = 3.5; y < height; y += 7) {
      for (let x = 3.5; x < width; x += 7) builder.addCircle(x, y, 1);
    }
    return builder.build();
  }, [width, height]);
  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
      <Path path={dots} color={colours.corkDot} />
    </Canvas>
  );
}

function PinCard({
  pin,
  index,
  onPress,
}: {
  readonly pin: Pinned;
  readonly index: number;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const room = useRoom();
  const critter = pin.actor ? room.people.get(pin.actor)?.critter : null;
  const sprouted = room.sproutedFrom(pin.seq);
  const drop = useSharedValue(reduce ? 0 : 1);
  useEffect(() => {
    if (reduce) return;
    // Each card lands in two drawings, one after another.
    const frame = motion.twos.frameMs;
    drop.set(
      withDelay(
        index * frame,
        withSequence(
          withTiming(0.5, { duration: 0 }),
          withDelay(frame, withTiming(0, { duration: 0 })),
        ),
      ),
    );
  }, [drop, index, reduce]);
  const tilt = TILTS[index % TILTS.length] ?? 0;
  const style = useAnimatedStyle(() => ({
    opacity: drop.get() >= 1 ? 0 : 1,
    transform: [
      { rotate: `${tilt}deg` },
      { scale: 1 + drop.get() * 0.08 },
      { translateY: -drop.get() * 6 },
    ],
  }));
  return (
    <Animated.View style={[{ width: '47%' }, style]}>
      <Press
        onPress={onPress}
        radius={4}
        accessibilityLabel={`${room.nameOf(pin.actor)}: ${pin.text}. ${t('chat.pins.open')}`}
        style={{
          flexGrow: 1,
          backgroundColor: colours.corkCard,
          borderRadius: 4,
          paddingTop: 16,
          paddingHorizontal: 14,
          paddingBottom: 12,
          gap: 6,
          boxShadow: colours.corkCardShadow,
        }}
      >
        <View style={{ position: 'absolute', top: -8, left: '50%', marginLeft: -11 }}>
          <ArtIcon name="pin" size={22} color={colours.pinInk} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {critter ? <Avatar kind={critter.species} look={lookOf(critter)} size={22} /> : null}
          <Txt variant="bubbleName" color={palette.secondary} style={{ fontSize: 12.5 }}>
            {room.nameOf(pin.actor)}
          </Txt>
        </View>
        <Txt variant="bubble" multiline>
          {pin.text}
        </Txt>
        {sprouted ? (
          <Txt variant="quietHead" color={palette.go.bg}>
            {t('chat.pins.sprouted')}
          </Txt>
        ) : null}
      </Press>
    </Animated.View>
  );
}

/** The noticeboard: pinned messages as cards on cork. */
export function Noticeboard({
  open,
  pinned,
  onClose,
}: {
  readonly open: boolean;
  readonly pinned: readonly Pinned[];
  readonly onClose: () => void;
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const { jumpTo } = useRoom();
  const { height } = useWindowDimensions();
  const top = height - 240;
  const [cork, setCork] = useState({ w: 0, h: 0 });
  return (
    <Sheet modal detents={[top]} index={open ? 0 : -1} onIndexChange={(i) => i < 0 && onClose()}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <Txt variant="displayM" accessibilityRole="header">
          {t('chat.pins.title')}
        </Txt>
        <Press
          onPress={onClose}
          darken={false}
          hitSlop={12}
          accessibilityLabel={t('chat.pins.done')}
        >
          <Txt variant="buttonText" color={palette.go.bg}>
            {t('chat.pins.done')}
          </Txt>
        </Press>
      </View>
      <Txt
        variant="caption"
        multiline
        color={palette.secondary}
        style={{ fontSize: 14, marginTop: -2 }}
      >
        {t('chat.pins.note')}
      </Txt>
      <View
        onLayout={(e) => setCork({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        style={{
          flex: 1,
          marginTop: 4,
          marginBottom: 28,
          borderRadius: 22,
          backgroundColor: colours.cork,
          overflow: 'hidden',
        }}
      >
        {cork.w > 0 ? <Cork width={cork.w} height={cork.h} /> : null}
        <SheetScrollView
          contentContainerStyle={{
            paddingVertical: 26,
            paddingHorizontal: 18,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            rowGap: 22,
          }}
        >
          {pinned.length === 0 ? (
            <Txt
              variant="sheetBody"
              multiline
              color={colours.corkCard}
              align="center"
              style={{ width: '100%' }}
            >
              {t('chat.pins.empty')}
            </Txt>
          ) : (
            pinned.map((pin, i) => (
              <PinCard
                key={pin.seq}
                pin={pin}
                index={open ? i : 0}
                onPress={() => {
                  onClose();
                  jumpTo(pin.seq);
                }}
              />
            ))
          )}
        </SheetScrollView>
      </View>
    </Sheet>
  );
}
