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
import { canEdit } from '../model/rows';
import type { BubbleItem } from '../model/timeline';
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
import { TimelineList, type JumpRequest } from './timeline-list';
import { useRoomData } from './use-room-data';
import { MicButton, RecorderPanel, useVoiceRecorder } from './voice-recorder';
import { noteSeen } from '../ui/seen-store';
import { useArtVisible } from '../../../ui/motion/visibility';
import { useMe } from '../ui/use-me';
import { TypingLine } from './lines';
import { sprouted, useMentionRows, useOutLine } from './room-people';

const PIN_BAR = 46;
/** The composer sits 32 points above the bottom edge (over the home indicator), as drawn. */
const COMPOSER_BOTTOM = 32;
/** With the keyboard up, the composer keeps 8 points above it. */
const COMPOSER_LIFT = COMPOSER_BOTTOM - 8;

export interface ChatScreenProps {
  readonly farm: string;
  /** A message to show: the chat scrolls to it and lights it briefly. */
  readonly seq?: number;
  /** Start replying to, or editing, a message (from the message menu). */
  readonly reply?: number;
  readonly edit?: number;
}

/** A farm's chat under its farm, or a visit on its porch. */
export function ChatScreen(props: ChatScreenProps) {
  // Here until the root layout provides the keyboard controller for every screen.
  return (
    <KeyboardProvider>
      <ChatRoom {...props} />
    </KeyboardProvider>
  );
}

function ChatRoom({ farm, seq, reply, edit }: ChatScreenProps) {
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
  const [replyTo, setReplyTo] = useState<BubbleItem | null>(null);
  const [editing, setEditing] = useState<BubbleItem | null>(null);
  const [board, setBoard] = useState(false);
  const [composerH, setComposerH] = useState(92);
  const [jump, setJump] = useState<JumpRequest | null>(seq === undefined ? null : { seq, id: 0 });
  const [toNewest, setToNewest] = useState(0);
  const pinned = usePinned(farm, state?.pins ?? [], (s) => bubbles.get(s) ?? null);
  const notice = useRoomNotice(data.link, state, data.me, data.now);
  const keyboard = useReanimatedKeyboardAnimation();

  // What this phone has shown of the chat, kept on the phone only, for the chat list's honey dot.
  const showing = useArtVisible();
  useEffect(() => {
    if (showing && data.lastSeq > 0) noteSeen(farm, data.lastSeq);
  }, [showing, farm, data.lastSeq]);

  // A link to a message (search, pins, a push) shows it once it's paged in.
  useEffect(() => {
    if (seq !== undefined) setJump((j) => ({ seq, id: (j?.id ?? 0) + 1 }));
  }, [seq]);

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
    if (!item) return;
    router.setParams({ edit: undefined });
    if (canEdit(item, Date.now())) {
      setReplyTo(null);
      setEditing(item);
    } else if (item.mine) {
      toast.show(t('chat.composer.editClosed'));
    }
  }, [edit, bubbles, toast, t]);

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

  // The room's callbacks read the latest data through a ref, so the rows below only re-render
  // when something they draw changes.
  const latest = useRef({ data, bubbles, people, state, t });
  latest.current = { data, bubbles, people, state, t };
  const nameOf = useCallback((person: PersonId | null) => {
    const { data: d, people: p, state: st, t: tr } = latest.current;
    if (person === null) return '';
    if (person === d.me) return tr('chat.you');
    return p.get(st?.aliases[person] ?? person)?.name ?? tr('chat.friendWhoLeft');
  }, []);
  const room: RoomValue = useMemo(
    () => ({
      farm,
      me: data.me,
      timeZone: state?.timeZone ?? null,
      visit,
      people,
      nameOf,
      bubbleAt: (s: number) => latest.current.bubbles.get(s) ?? null,
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
        const a = latest.current.data.actions;
        if (item.myDew !== null) void a.takeDewBack(item.myDew);
        else void a.dewdrop(item.seq);
      },
      retry: (item) => void latest.current.data.actions.retry(item),
      jumpTo: (s: number) => setJump((j) => ({ seq: s, id: (j?.id ?? 0) + 1 })),
      wave: (to) => void latest.current.data.actions.wave(to),
      sproutedFrom: (s) => sprouted(latest.current.data.events, latest.current.state, s),
    }),
    [farm, data.me, state?.timeZone, visit, people, nameOf],
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

  const sheetTop = useAnimatedStyle(() => ({ top: height.get() - SHEET_OVERLAP }));
  // The chat lifts with the keyboard, as the composer does (translated, never resized).
  const listOffset = useAnimatedStyle(() => ({
    top: -(height.get() - SHEET_OVERLAP),
    transform: [{ translateY: keyboard.height.get() + keyboard.progress.get() * COMPOSER_LIFT }],
  }));
  const pinTop = pinned.length > 0 ? PIN_BAR : 0;
  const composerBottom = insets.bottom > 0 ? COMPOSER_BOTTOM : 12;

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
              boxShadow: colours.sheetShadow,
              overflow: 'hidden',
            },
            sheetTop,
          ]}
        >
          <Animated.View
            style={[{ position: 'absolute', left: 0, right: 0, height: screenH }, listOffset]}
          >
            <TimelineList
              rows={timeline}
              now={data.now}
              older={data.older}
              loadOlder={() => void data.loadOlder()}
              topSpace={size.full - SHEET_OVERLAP + 14 + pinTop}
              bottomSpace={composerH + 8}
              scrollY={scrollY}
              jump={jump}
              toNewest={toNewest}
              top={
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
                ) : null
              }
              bottom={
                typing.length > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <TypingLine people={typing} />
                  </View>
                ) : null
              }
            />
          </Animated.View>
          {pinned.length > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: colours.pinStrip,
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
          offset={{ opened: COMPOSER_LIFT }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <View
            onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}
            style={{
              paddingTop: 16,
              paddingHorizontal: 12,
              paddingBottom: composerBottom,
              gap: 8,
              backgroundImage: colours.composerFade,
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
                setToNewest((n) => n + 1);
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
      <Txt variant="caption" color={palette.secondary} style={{ fontSize: 13 }}>
        {t('chat.room.visitOnly', { name })}
      </Txt>
    </View>
  );
}
