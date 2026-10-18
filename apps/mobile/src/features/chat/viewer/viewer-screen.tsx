import type { PersonId } from '@kithfield/contracts';
import { springs } from '@kithfield/theme';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useDataClient, useFarm, useOpenFarm, useSend } from '../../../data';
import { ArtIcon } from '../../../ui/art/art-view';
import { Glass } from '../../../ui/components/glass';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useSession } from '../../../ui/session/session';
import { Txt } from '../../../ui/type/text';
import { signedUrl, useSignedUrl } from '../api/signed-urls';
import { weekdayTime } from '../model/format';
import { sharedItems, viewable, type SharedItem } from '../model/media';
import { buildTimeline, type LogEvent } from '../model/timeline';
import { go } from '../routes';
import { useDewLabelFor } from './dew-label';
import { VideoItem } from './video-item';
import { Zoomable } from './zoomable';

const BG = '#17151c';
const INK = '#f4ecda';
const SUB = '#bdb4c4';
const GLASS = { fill: 'rgba(30,32,56,.5)', border: 'rgba(255,255,255,.14)' };

function Circle({
  label,
  onPress,
  children,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <Glass radius={22} fill={GLASS.fill} border={GLASS.border}>
      <Press
        onPress={onPress}
        radius={22}
        accessibilityLabel={label}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </Press>
    </Glass>
  );
}

function Page({
  item,
  width,
  height,
  active,
  drag,
  zoomed,
  onClose,
}: {
  readonly item: SharedItem;
  readonly width: number;
  readonly height: number;
  readonly active: boolean;
  readonly drag: ReturnType<typeof useSharedValue<number>>;
  readonly zoomed: ReturnType<typeof useSharedValue<boolean>>;
  readonly onClose: () => void;
}) {
  const url = useSignedUrl(item.ref?.key);
  const ratio = item.ref?.width && item.ref.height ? item.ref.height / item.ref.width : 1.2;
  return (
    <Zoomable width={width} height={height} drag={drag} zoomed={zoomed} onClose={onClose}>
      {url && item.tab === 'videos' ? (
        <VideoItem
          url={url}
          width={width}
          height={height}
          active={active}
          durationMs={item.durationMs}
        />
      ) : url ? (
        <Image
          source={{ uri: url }}
          style={{ width, height: Math.min(height, width * ratio) }}
          contentFit="contain"
          transition={120}
        />
      ) : null}
    </Zoomable>
  );
}

/** The photo and video viewer (04-13): swipe between, pinch to zoom, swipe down to close. */
export function ViewerScreen({
  farm,
  seq,
  index,
}: {
  readonly farm: string;
  readonly seq: number;
  readonly index: number;
}) {
  useOpenFarm(farm);
  const client = useDataClient();
  const replica = useFarm(farm);
  const send = useSend(farm);
  const me = useSession().person?.id ?? null;
  const { t, language } = useLocale();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const [events, setEvents] = useState<readonly LogEvent[]>([]);
  const [at, setAt] = useState(0);
  const [locked, setLocked] = useState(false);
  const pager = useRef<FlatList<SharedItem>>(null);
  const drag = useSharedValue(0);
  const zoomed = useSharedValue(false);
  const shown = useSharedValue(reduce ? 1 : 0);
  const state = replica?.state ?? null;

  useEffect(() => {
    let live = true;
    void client.events(farm, { limit: 2000 }).then((e) => live && setEvents(e));
    return () => {
      live = false;
    };
  }, [client, farm, replica?.lastSeq]);
  const items = useMemo(() => viewable(sharedItems(events)), [events]);
  const startAt = Math.max(
    0,
    items.findIndex((i) => i.seq === seq && i.index === index),
  );
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || items.length === 0) return;
    placed.current = true;
    setAt(startAt);
    requestAnimationFrame(() => pager.current?.scrollToIndex({ index: startAt, animated: false }));
  }, [items.length, startAt]);

  // Opens with a zoom (a 280 ms spring), as if from the bubble.
  useEffect(() => {
    if (!reduce) shown.set(withSpring(1, { ...springs.sheet }));
  }, [reduce, shown]);
  useAnimatedReaction(
    () => zoomed.get(),
    (now, before) => {
      if (now !== before) scheduleOnRN(setLocked, now);
    },
  );

  const close = () => router.back();
  const current = items[at] ?? null;
  const backdrop = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - drag.get() / 400) * shown.get(),
  }));
  const chrome = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - drag.get() / 120) }));
  const zoomIn = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: 0.86 + 0.14 * shown.get() }],
  }));

  const bubble = useMemo(() => {
    if (!current) return null;
    const timeline = buildTimeline({
      events,
      unsent: replica?.pending ?? [],
      refused: [],
      me,
      state,
      now: Date.now(),
    });
    return timeline.find((i) => i.type === 'bubble' && i.seq === current.seq) ?? null;
  }, [current, events, replica?.pending, me, state]);
  const dew = bubble?.type === 'bubble' ? bubble.dew : [];
  const myDew = bubble?.type === 'bubble' ? bubble.myDew : null;
  const dewLabel = useDewLabelFor(dew, me, state);
  const nameOf = (p: PersonId | null) =>
    p === me
      ? t('chat.you')
      : (state?.members.find((m) => m.person === p)?.name ?? t('chat.friendWhoLeft'));

  const share = async () => {
    if (!current?.ref) return;
    const url = await signedUrl(current.ref.key);
    if (!url) return;
    const ext = current.ref.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const local = `${FileSystem.cacheDirectory}kithfield-${current.seq}-${current.index}.${ext}`;
    await FileSystem.downloadAsync(url, local);
    await Sharing.shareAsync(local, { mimeType: current.ref.mime });
  };

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: BG }, backdrop]} />
      <Animated.View style={[{ flex: 1 }, zoomIn]}>
        <FlatList
          ref={pager}
          data={items}
          horizontal
          pagingEnabled
          scrollEnabled={!locked}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => `${i.seq}:${i.index}`}
          getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => (
            <Page
              item={item}
              width={width}
              height={height}
              active={i === at}
              drag={drag}
              zoomed={zoomed}
              onClose={close}
            />
          )}
        />
      </Animated.View>
      {items.length === 0 ? (
        <View style={{ position: 'absolute', top: height / 2 - 10, left: 0, right: 0 }}>
          <Txt variant="caption" align="center" color={SUB}>
            {events.length === 0 ? t('chat.viewer.loading') : t('chat.viewer.missing')}
          </Txt>
        </View>
      ) : null}
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            top: Math.max(insets.top, 20) + 4,
            left: 16,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
          chrome,
        ]}
      >
        <Circle label={t('chat.viewer.close')} onPress={close}>
          <Txt variant="body" color={INK} style={{ fontSize: 20, lineHeight: 22 }}>
            ✕
          </Txt>
        </Circle>
        {current ? (
          <View style={{ alignItems: 'center' }} accessible accessibilityRole="header">
            <Txt variant="rowTitle" color={INK} style={{ fontSize: 15, lineHeight: 18 }}>
              {nameOf(current.actor)}
            </Txt>
            <Txt variant="caption" color={SUB} style={{ fontSize: 12.5, lineHeight: 15 }}>
              {t('chat.viewer.position', {
                when: weekdayTime(current.at, language, state?.timeZone ?? null),
                index: at + 1,
                total: items.length,
              })}
            </Txt>
          </View>
        ) : null}
        <Circle label={t('chat.viewer.share')} onPress={() => void share()}>
          <ArtIcon name="share" size={22} color={INK} />
        </Circle>
      </Animated.View>
      {current ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            {
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: Math.max(insets.bottom, 20) + 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            chrome,
          ]}
        >
          <Glass radius={24} fill={GLASS.fill} border={GLASS.border}>
            <Press
              onPress={() =>
                void (myDew !== null
                  ? send('unsend', { target: myDew })
                  : send('dewdrop', { target: current.seq }))
              }
              haptic="soft"
              radius={24}
              accessibilityLabel={
                myDew !== null ? t('chat.bubble.dewdropOff') : t('chat.bubble.dewdropOn')
              }
              style={{
                height: 48,
                paddingLeft: 8,
                paddingRight: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ArtIcon name="dewdrop" size={30} color={INK} />
              {dewLabel ? (
                <Txt variant="rowTitle" color={INK} style={{ fontSize: 14, lineHeight: 14 }}>
                  {dewLabel}
                </Txt>
              ) : null}
            </Press>
          </Glass>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Circle
              label={t('chat.viewer.reply')}
              onPress={() => {
                router.back();
                go.chatWith(farm, { reply: String(current.seq) });
              }}
            >
              <ArtIcon name="reply" size={22} color={INK} />
            </Circle>
            <Circle label={t('chat.viewer.more')} onPress={() => go.messageMenu(farm, current.seq)}>
              <ArtIcon name="more" size={22} color={INK} />
            </Circle>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
