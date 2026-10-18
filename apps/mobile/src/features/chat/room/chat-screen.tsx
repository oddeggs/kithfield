import type { PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, useWindowDimensions, View } from 'react-native';
import {
  KeyboardProvider,
  KeyboardStickyView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { castOf, porchOwner, visitPeer } from '../model/people';
import type { BubbleItem, TimelineItem } from '../model/timeline';
import { go } from '../routes';
import { useChatColours } from '../ui/chat-colours';
import { Composer, type MentionRow } from './composer';
import { FarmHeaderArt, PorchArt } from './header-art';
import {
  FARM_HEADER,
  HeaderArtFrame,
  HeaderBar,
  PORCH_HEADER,
  SHEET_OVERLAP,
  useHeaderHeight,
} from './header';
import { RoomNotice, useRoomNotice } from './room-notice';
import { Noticeboard, PinBar, usePinned } from './noticeboard';
import { RoomProvider, type RoomValue } from './room-context';
import { TimelineRow } from './timeline-row';
import { useRoomData } from './use-room-data';
import { MicButton, RecorderPanel, useVoiceRecorder } from './voice-recorder';
import { useHideTabBar } from '../ui/use-hide-tab-bar';
import { useMe } from '../ui/use-me';
import { TypingLine } from './lines';
import { runsOf, sprouted, useMentionRows, useOutLine } from './room-people';

const PIN_BAR = 46;

export interface ChatScreenProps {
  readonly farm: string;
  /** A message to show: the chat scrolls to it and lights it briefly. */
  readonly seq?: number;
  /** Start replying to, or editing, a message (from the message menu). */
  readonly reply?: number;
  readonly edit?: number;
}

/** A farm's chat under its farm (04-03, 04-04), or a visit on its porch (04-07). */
export function ChatScreen(props: ChatScreenProps) {
  return (
    <KeyboardProvider>
      <ChatRoom {...props} />
    </KeyboardProvider>
  );
}

function ChatRoom({ farm, seq, reply, edit }: ChatScreenProps) {
  useHideTabBar();
  const data = useRoomData(farm);
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const me = useMe();
  const { state, timeline, people, bubbles, presence, actions } = data;
  const visit = state?.kind === 'visit';
  const size = visit ? PORCH_HEADER : FARM_HEADER;
  const scrollY = useSharedValue(0);
  const height = useHeaderHeight(scrollY, size);
  const collapsed = useDerivedValue<number>(() => (height.get() <= size.min + 0.5 ? 1 : 0));
  const list = useAnimatedRef<Animated.FlatList<TimelineItem>>();
  const atEnd = useRef(true);
  const [replyTo, setReplyTo] = useState<BubbleItem | null>(null);
  const [editing, setEditing] = useState<BubbleItem | null>(null);
  const [board, setBoard] = useState(false);
  const [composerH, setComposerH] = useState(92);
  const [lit, setLit] = useState<string | null>(null);
  const pinned = usePinned(farm, state?.pins ?? [], (s) => bubbles.get(s) ?? null);
  const notice = useRoomNotice(data.link, state, data.me, data.now);
  const keyboard = useReanimatedKeyboardAnimation();

  // Rows that land after opening rise in; what was already there, or paged in, just sits.
  const openedAt = useRef<number | null>(null);
  if (openedAt.current === null && timeline.length > 0) {
    openedAt.current = Math.max(...timeline.map((i) => ('at' in i ? i.at : 0)), 0);
  }

  const nameOf = useCallback(
    (person: PersonId | null) => {
      if (person === null) return '';
      if (person === data.me) return t('chat.you');
      const p = people.get(state?.aliases[person] ?? person);
      return p?.name ?? t('chat.friendWhoLeft');
    },
    [data.me, people, state, t],
  );

  const scrollToEnd = useCallback(
    (animated: boolean) => {
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated }));
    },
    [list],
  );

  const jumpTo = useCallback(
    (target: number) => {
      const index = timeline.findIndex((i) => i.type === 'bubble' && i.seq === target);
      if (index < 0) {
        void data.loadOlder();
        return;
      }
      list.current?.scrollToIndex({ index, viewPosition: 0.4, animated: true });
      const key = timeline[index]?.key ?? null;
      setLit(key);
      setTimeout(() => setLit((k) => (k === key ? null : k)), 1400);
    },
    [timeline, data, list],
  );

  // A link to a message (search, pins, a push) scrolls to it once it's loaded.
  const wanted = useRef<number | undefined>(seq);
  useEffect(() => {
    wanted.current = seq;
  }, [seq]);
  useEffect(() => {
    const target = wanted.current;
    if (target === undefined || timeline.length === 0) return;
    if (bubbles.has(target)) {
      wanted.current = undefined;
      setTimeout(() => jumpTo(target), 250);
    } else if (data.older !== 'done') {
      void data.loadOlder();
    }
  }, [timeline, bubbles, jumpTo, data]);

  // Reply and edit come back from the message menu as route params.
  useEffect(() => {
    if (reply === undefined) return;
    const item = bubbles.get(reply);
    if (item) {
      setEditing(null);
      setReplyTo(item);
      router.setParams({ reply: undefined });
    }
  }, [reply, bubbles]);
  useEffect(() => {
    if (edit === undefined) return;
    const item = bubbles.get(edit);
    if (item?.mine && item.body.kind === 'message') {
      setReplyTo(null);
      setEditing(item);
      router.setParams({ edit: undefined });
    }
  }, [edit, bubbles]);

  // New rows keep the chat at its newest when it was already there.
  const count = timeline.length;
  useEffect(() => {
    if (atEnd.current) scrollToEnd(true);
  }, [count, scrollToEnd]);

  // The oldest pin coming down to make room is said once, quietly.
  const pins = state?.pins ?? [];
  const lastPins = useRef<readonly number[] | null>(null);
  useEffect(() => {
    const before = lastPins.current;
    lastPins.current = pins;
    if (
      before &&
      before.length >= 10 &&
      pins.length >= 10 &&
      pins.some((p) => !before.includes(p))
    ) {
      const dropped = before.filter((p) => !pins.includes(p));
      if (dropped.length > 0) toast.show(t('chat.pins.droppedOff'));
    }
  }, [pins.join(',')]);

  const room: RoomValue = useMemo(
    () => ({
      farm,
      me: data.me,
      state,
      visit,
      people,
      nameOf,
      bubbleAt: (s: number) => bubbles.get(s) ?? null,
      reply: (item) => {
        setEditing(null);
        setReplyTo(item);
      },
      openMenu: (item) => {
        if (item.seq === null) return;
        go.messageMenu(farm, item.seq);
      },
      toggleDew: (item) => {
        if (item.seq === null) return;
        if (item.myDew !== null) void actions.takeDewBack(item.myDew);
        else void actions.dewdrop(item.seq);
      },
      retry: (item) => void actions.retry(item),
      jumpTo,
      wave: (to) => void actions.wave(to),
      sproutedFrom: (s) => sprouted(data.events, state, s),
      isNew: (key) => {
        const item = timeline.find((i) => i.key === key);
        return (
          item !== undefined &&
          'at' in item &&
          openedAt.current !== null &&
          item.at > openedAt.current
        );
      },
    }),
    [farm, data.me, data.events, state, visit, people, nameOf, bubbles, actions, jumpTo, timeline],
  );

  const voice = useVoiceRecorder((note) => {
    const target = replyTo?.seq ?? null;
    setReplyTo(null);
    void actions.voice(note, target);
  });

  const mentionRows: MentionRow[] = useMentionRows(state, data.me, data.now);
  const outLine = useOutLine(state, presence.here, data.me);
  const peer = visitPeer(state, data.me);
  const owner = porchOwner(state);
  const typing = presence.typing.filter((p) => p !== data.me);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
  });
  const sheetTop = useAnimatedStyle(() => ({ top: height.get() - SHEET_OVERLAP }));
  const listOffset = useAnimatedStyle(() => ({ top: -(height.get() - SHEET_OVERLAP) }));
  const spacer = useAnimatedStyle(() => ({
    height: composerH + Math.max(0, -keyboard.height.get() - insets.bottom) + 8,
  }));
  const pinTop = pinned.length > 0 ? PIN_BAR : 0;

  const rows = timeline;
  const runs = useMemo(() => runsOf(rows), [rows]);
  const lastSent = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const r = rows[i];
      if (r?.type === 'bubble' && r.mine && r.delivery === 'sent') return r.key;
    }
    return null;
  }, [rows]);

  const title = visit ? (peer?.name ?? t('chat.friendWhoLeft')) : (state?.name ?? '');
  const subtitle = visit
    ? owner && owner.person !== data.me
      ? t('chat.room.porchTheirs', { name: owner.name ?? t('chat.friendWhoLeft') })
      : t('chat.room.porchYours')
    : outLine;

  return (
    <RoomProvider value={room}>
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <HeaderArtFrame height={height} size={size}>
          {visit ? (
            <PorchArt
              cast={[
                owner,
                owner === peer ? null : peer,
                ...state.members.filter((m) => m !== owner && m !== peer),
              ]
                .filter((m) => m !== null && m !== undefined)
                .slice(0, 2)
                .map((m) => castOf(m.critter))
                .join(',')}
              pot={state.pot ? { plant: state.pot.plant, stage: state.pot.stage } : null}
              width={screenW}
              height={size.full}
              night={palette.appearance === 'night'}
            />
          ) : (
            <FarmHeaderArt
              season={state?.season.season ?? 'spring'}
              critters={(state?.members ?? []).map((m) => ({
                person: m.person,
                critter: m.critter,
                sleeping: m.hibernating || (m.pausedUntil ?? 0) > data.now,
              }))}
              width={screenW}
              height={size.full}
              collapsed={collapsed}
            />
          )}
        </HeaderArtFrame>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: palette.background,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              boxShadow: '0 -6px 20px -12px rgba(60,40,20,.3)',
              overflow: 'hidden',
            },
            sheetTop,
          ]}
        >
          <Animated.View
            style={[{ position: 'absolute', left: 0, right: 0, height: screenH }, listOffset]}
          >
            <Animated.FlatList
              ref={list}
              data={rows}
              keyExtractor={(item) => item.key}
              onScroll={onScroll}
              scrollEventThrottle={16}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              onStartReached={() => void data.loadOlder()}
              onStartReachedThreshold={0.5}
              onScrollToIndexFailed={(info) => {
                list.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
              }}
              onMomentumScrollEnd={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                atEnd.current =
                  contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
              }}
              onScrollEndDrag={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                atEnd.current =
                  contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
              }}
              onContentSizeChange={() => {
                if (atEnd.current) scrollToEnd(false);
              }}
              contentContainerStyle={{
                paddingTop: size.full - SHEET_OVERLAP + 14 + pinTop,
                paddingHorizontal: 14,
              }}
              ItemSeparatorComponent={Gap}
              ListHeaderComponent={
                data.older === 'loading' ? (
                  <Txt
                    variant="handS"
                    color={colours.hand}
                    align="center"
                    style={{ paddingBottom: 12 }}
                  >
                    {t('chat.room.earlier')}
                  </Txt>
                ) : visit ? (
                  <VisitNote name={peer?.name ?? t('chat.friendWhoLeft')} />
                ) : undefined
              }
              ListFooterComponent={
                <View>
                  {typing.length > 0 ? (
                    <View style={{ marginTop: 12 }}>
                      <TypingLine people={typing} />
                    </View>
                  ) : null}
                  <Animated.View style={spacer} />
                </View>
              }
              renderItem={({ item, index }) => (
                <TimelineRow
                  item={item}
                  now={data.now}
                  first={runs[index]?.first ?? true}
                  last={runs[index]?.last ?? true}
                  showSent={item.key === lastSent}
                  lit={item.key === lit}
                />
              )}
            />
          </Animated.View>
          {pinned.length > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor:
                  palette.appearance === 'day' ? 'rgba(247,241,231,.96)' : palette.sheet,
              }}
            >
              <PinBar
                pinned={pinned}
                onPress={() => {
                  Keyboard.dismiss();
                  setBoard(true);
                }}
              />
            </View>
          ) : null}
        </Animated.View>
        <HeaderBar
          title={title}
          subtitle={subtitle}
          onBack={() => (router.canGoBack() ? router.back() : go.chatList())}
          backLabel={t('chat.room.back')}
          onTitle={() => go.media(farm)}
          titleLabel={`${title}, ${subtitle}. ${t('chat.room.media')}`}
          right={
            visit && peer
              ? {
                  icon: 'more',
                  label: t('chat.room.more'),
                  onPress: () => go.critter(farm, peer.person),
                }
              : { icon: 'seeds', label: t('chat.room.seedBed'), onPress: go.seedBed }
          }
        />
        <KeyboardStickyView
          offset={{ opened: insets.bottom - 8 }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <View
            onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}
            style={{
              paddingTop: 16,
              paddingHorizontal: 12,
              paddingBottom: Math.max(insets.bottom, 20) + 12,
              gap: 8,
              backgroundImage:
                palette.appearance === 'day'
                  ? 'linear-gradient(rgba(245,238,226,0), #F5EEE2 30%)'
                  : 'linear-gradient(rgba(27,31,61,0), #1B1F3D 30%)',
            }}
          >
            <RoomNotice notice={notice} />
            <Composer
              members={mentionRows}
              replyTo={replyTo}
              editing={editing}
              disabled={notice !== null && notice.blocksWriting}
              onCancel={() => {
                setReplyTo(null);
                setEditing(null);
              }}
              onSend={(text) => {
                atEnd.current = true;
                if (editing?.seq != null) void actions.edit(editing.seq, text);
                else void actions.sendText(text, replyTo?.seq ?? null);
                setReplyTo(null);
                setEditing(null);
              }}
              onDewdrop={() => {
                if (replyTo?.seq != null) void actions.dewdrop(replyTo.seq);
                else void actions.dewdrop();
                toast.show(t('chat.composer.dewdropLeft'), 'dewdrop');
              }}
              mic={<MicButton voice={voice} />}
            />
          </View>
        </KeyboardStickyView>
        <RecorderPanel
          voice={voice}
          me={me.critter}
          name={me.name ?? t('chat.you')}
          season={state?.season.season ?? 'spring'}
          bottomInset={insets.bottom}
        />
        <Noticeboard open={board} pinned={pinned} onClose={() => setBoard(false)} />
      </View>
    </RoomProvider>
  );
}

function Gap({ leadingItem }: { readonly leadingItem?: TimelineItem }) {
  return <View style={{ height: leadingItem?.type === 'day' ? 12 : 12 }} />;
}

function VisitNote({ name }: { readonly name: string }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingBottom: 12,
      }}
    >
      <ArtIcon name="lock" size={14} color={palette.secondary} />
      <Txt variant="caption" color={palette.secondary} style={{ fontSize: 13, lineHeight: 16.9 }}>
        {t('chat.room.visitOnly', { name })}
      </Txt>
    </View>
  );
}
