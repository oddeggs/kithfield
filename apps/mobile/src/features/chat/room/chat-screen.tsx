import type { PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';
import {
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
import { usePane } from '../../../ui/layout/pane';
import { PaneHeader, usePaneHeaderHeight } from '../../../ui/layout/pane-header';
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
import { travelIds } from '../../../ui/travel';
// The first-run tip about pressing and holding a message.
import { BackPreview } from '../../android/back-preview';
import { HintOverlay } from '../../hints/hint-overlay';
import { useRoomData } from './use-room-data';
import { MicButton, RecorderPanel, useVoiceRecorder } from './voice-recorder';
import { noteSeen } from '../ui/seen-store';
import { useArtVisible } from '../../../ui/motion/visibility';
import { fieldGuideRoutes } from '../../field-guide/routes';
import { useInStickerNote } from '../../stickers/together/in-sticker-note';
import { useMe } from '../ui/use-me';
import { TypingLine } from './lines';
import { sprouted, useMentionRows, useOutLine } from './room-people';

const PIN_BAR = 46;
/** The composer sits 32 points above the bottom edge (over the home indicator), as drawn. */
const COMPOSER_BOTTOM = 32;
/** With the keyboard up, the composer keeps 14 points above it, as drawn. */
const COMPOSER_LIFT = COMPOSER_BOTTOM - 14;

export interface ChatScreenProps {
  readonly farm: string;
  /** A message to show: the chat scrolls to it and lights it briefly. */
  readonly seq?: number;
  /** Start replying to, or editing, a message (from the message menu). */
  readonly reply?: number;
  readonly edit?: number;
}

/** A farm's chat under its farm, or a visit on its porch. */
export function ChatScreen({ farm, seq, reply, edit }: ChatScreenProps) {
  const data = useRoomData(farm);
  // The first time a friend draws you into a together sticker, a note says so once.
  useInStickerNote(farm);
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  // In a pane of a large screen the chat sizes to the pane; beside a farm of its own, it wears a
  // flat header instead of drawing the farm over itself.
  const pane = usePane();
  const { height: screenH, width: screenW } = pane;
  const me = useMe();
  const { state, timeline, people, bubbles, presence, actions } = data;
  const visit = state?.kind === 'visit';
  const flat = pane.chrome === 'flat' && !visit;
  const flatHeight = usePaneHeaderHeight();
  const size = flat ? { full: flatHeight, min: flatHeight } : visit ? PORCH_HEADER : FARM_HEADER;
  const overlap = flat ? 0 : SHEET_OVERLAP;
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
      router.setParams({ replyTo: undefined });
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
      openMenu: (item, top) => {
        if (item.seq === null) return;
        go.messageMenu(farm, item.seq, top);
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
      events: () => latest.current.data.events,
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
  // Who sits on the porch, the owner first: the two the header draws.
  const porchCast = [
    owner,
    owner === peer ? null : peer,
    ...(state?.members ?? []).filter((m) => m !== owner && m !== peer),
  ]
    .filter((m) => m !== null && m !== undefined)
    .slice(0, 2);
  const typing = presence.typing.filter((p) => p !== data.me);

  const sheetTop = useAnimatedStyle(() => ({ top: height.get() - overlap }));
  // The chat lifts with the keyboard, as the composer does (translated, never resized).
  const listOffset = useAnimatedStyle(() => ({
    top: -(height.get() - overlap),
    transform: [{ translateY: keyboard.height.get() + keyboard.progress.get() * COMPOSER_LIFT }],
  }));
  // A flat header carries the noticeboard's pin itself, so the pinned strip gives way to it.
  const pinBar = pinned.length > 0 && !flat;
  const pinTop = pinBar ? PIN_BAR : 0;
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
        {flat ? null : (
          <HeaderArtFrame height={height} size={size}>
            {visit ? (
              <PorchArt
                cast={porchCast.map((m) => castOf(m.critter)).join(',')}
                seats={porchCast.map((m) => travelIds.porchSeat(farm, m.person))}
                pot={state.pot ? { plant: state.pot.plant, stage: state.pot.stage } : null}
                width={screenW}
                height={size.full}
                night={palette.appearance === 'night'}
                onPot={{
                  label: t('chat.room.porchPot'),
                  open: () => router.push(fieldGuideRoutes.porchPot(farm)),
                }}
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
                sproutId={travelIds.chatSprout(farm)}
                night={palette.appearance === 'night'}
              />
            )}
          </HeaderArtFrame>
        )}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: palette.background,
              overflow: 'hidden',
            },
            flat
              ? null
              : {
                  borderTopLeftRadius: 26,
                  borderTopRightRadius: 26,
                  boxShadow: colours.sheetShadow,
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
              topSpace={size.full - overlap + 14 + pinTop}
              topFold={size.full - size.min}
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
          {pinBar ? (
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
        {flat ? (
          <PaneHeader
            title={title}
            subtitle={subtitle}
            onTitle={pane.expand?.onPress ?? (() => go.media(farm))}
            titleLabel={`${title}, ${subtitle}. ${pane.expand?.label ?? t('chat.room.media')}`}
            back={
              pane.back
                ? {
                    label: t('chat.room.back'),
                    onPress: () => (router.canGoBack() ? router.back() : go.chatList()),
                  }
                : null
            }
            actions={[
              {
                icon: 'pin',
                label: t('layout.chat.noticeboard'),
                onPress: () => {
                  Keyboard.dismiss();
                  setBoard(true);
                },
              },
              { icon: 'seeds', label: t('layout.chat.seedBed'), onPress: go.seedBed },
              { icon: 'more', label: t('layout.chat.more'), onPress: () => go.media(farm) },
            ]}
          />
        ) : (
          <HeaderBar
            title={title}
            subtitle={subtitle}
            onBack={pane.back ? () => (router.canGoBack() ? router.back() : go.chatList()) : null}
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
        )}
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
        {/* Android 14's back preview over the chat (`14 Platforms`). */}
        {pane.back ? (
          <BackPreview onBack={() => (router.canGoBack() ? router.back() : go.chatList())} />
        ) : null}
        <HintOverlay
          hint="message"
          show={showing && bubbles.size > 0 && !board && replyTo === null && editing === null}
          spot={null}
        />
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
