import { chatMotion, motion } from '@kithfield/theme';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  useLongPressGesture,
  useExclusiveGestures,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ArtIcon } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { fadeTo, sheetTo } from '../../../ui/motion/motion';
import { Press } from '../../../ui/motion/press';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { timing, TravelAnchor, travelIds, useTravel } from '../../../ui/travel';
import { Txt } from '../../../ui/type/text';
import { lookOf } from '../model/people';
import { refusalOf } from '../model/refusals';
import type { BubbleItem } from '../model/timeline';
import { clock } from '../model/format';
import { useChatColours } from '../ui/chat-colours';
import { go } from '../routes';
import { BubbleBody } from './bubbles';
import { ReactionRow } from './gesture-seams';
import { useRoom } from './room-context';

/** How far a bubble follows a swipe right before it asks to reply. */
const REPLY_AT = 56;

/** A row that arrived after the chat opened rises 12 points and fades in; older ones just sit. */
export function Rise({
  fresh,
  children,
}: {
  readonly fresh: boolean;
  readonly children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const shown = useSharedValue(fresh ? 0 : 1);
  const y = useSharedValue(fresh && !reduce ? chatMotion.risePt : 0);
  useEffect(() => {
    if (!fresh) return;
    const ease = { duration: chatMotion.riseMs, easing: Easing.bezier(...motion.fade.bezier) };
    shown.set(withTiming(1, ease));
    y.set(withTiming(0, ease));
  }, [fresh, shown, y]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: y.get() }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function StateLine({ item, showSent }: { readonly item: BubbleItem; readonly showSent: boolean }) {
  const colours = useChatColours();
  const { t } = useLocale();
  const { retry } = useRoom();
  const small = { fontSize: 11.5, fontWeight: '500' as const };
  if (item.delivery === 'failed') {
    const refusal = refusalOf(item.refused ?? '');
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt
          variant="bubbleState"
          multiline
          color={colours.failInk}
          style={{ fontSize: 12.5, flexShrink: 1 }}
        >
          {t(refusal.copy)}
        </Txt>
        {refusal.retry ? (
          <Press
            onPress={() => retry(item)}
            haptic="tap"
            radius={13}
            accessibilityLabel={t('chat.bubble.tryAgain')}
            hitSlop={9}
            style={{
              height: 26,
              paddingHorizontal: 10,
              borderRadius: 13,
              backgroundColor: colours.failButton,
              justifyContent: 'center',
            }}
          >
            <Txt variant="bubbleState" color={colours.failButtonInk} style={{ fontSize: 12.5 }}>
              {t('chat.bubble.tryAgain')}
            </Txt>
          </Press>
        ) : null}
      </View>
    );
  }
  const parts: ReactNode[] = [];
  if (item.delivery === 'sending') {
    parts.push(<ArtIcon key="clock" name="clock" size={12} color={colours.state} />);
    parts.push(
      <Txt key="t" variant="bubbleState" color={colours.state} style={small}>
        {t('chat.bubble.sending')}
      </Txt>,
    );
  } else if (item.edited) {
    parts.push(
      <Txt key="t" variant="bubbleState" color={colours.state} style={small}>
        {t('chat.bubble.edited')}
      </Txt>,
    );
  } else if (item.delivery === 'sent' && showSent) {
    parts.push(
      <Txt key="t" variant="bubbleState" color={colours.state} style={small}>
        {t('chat.bubble.sent')}
      </Txt>,
    );
    parts.push(<ArtIcon key="check" name="check" size={12} color={colours.state} />);
  }
  if (parts.length === 0) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        ...(item.mine ? { paddingRight: 4 } : { paddingLeft: 10 }),
      }}
    >
      {parts}
    </View>
  );
}

/** A failed bubble shakes once, 3 points. */
function useShake(failed: boolean) {
  const reduce = useReduceMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!failed || reduce) return;
    const step = { duration: chatMotion.shakeStepMs };
    const d = chatMotion.shakePt;
    x.set(
      withSequence(
        withTiming(-d, step),
        withTiming(d, step),
        withTiming(-d * 0.6, step),
        withTiming(0, step),
      ),
    );
  }, [failed, reduce, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
}

/** A face drawn at the size it swells to in flight, so it never blurs. */
const FACE_IN_FLIGHT = 76;

/**
 * A friend's critter beside their message. Tapped, the face lifts out of the chat, arcs to the
 * Farm tab and lands as their whole critter, then their card rises (signature motion); when the
 * farm isn't the one the Farm tab shows, the card opens here instead.
 */
function CritterFace({
  farm,
  seq,
  person,
  kind,
  look,
  label,
}: {
  readonly farm: string;
  readonly seq: number | null;
  readonly person: string;
  readonly kind: string;
  readonly look: ReturnType<typeof lookOf>;
  readonly label: string;
}) {
  const travel = useTravel();
  const id = travelIds.chatFace(farm, seq ?? -1);
  const meet = () => {
    const to = travelIds.farmCritter(farm, person);
    if (seq === null || !travel.has(to)) return go.critter(farm, person);
    travel.fly({
      from: id,
      to,
      sprite: { avatar: kind, look, size: FACE_IN_FLIGHT },
      morph: true,
      grow: 0.35,
      arc: 70,
      durationMs: timing('critterTravel', 'out'),
      backMs: timing('critterTravel', 'back'),
      onTouchdown: () => go.critter(farm, person),
    });
    go.farm();
  };
  return (
    <Press onPress={meet} darken={false} radius={15} hitSlop={6}>
      <TravelAnchor id={id}>
        <Avatar kind={kind} look={look} size={30} label={label} />
      </TravelAnchor>
    </Press>
  );
}

export interface BubbleRowProps {
  readonly item: BubbleItem;
  /** The first of a run of one person's bubbles: their name goes above it, their critter beside. */
  readonly first: boolean;
  /** Your newest message that has landed says "Sent". */
  readonly showSent: boolean;
}

/**
 * A bubble in its row: the friend's critter and name, the bubble, its dewdrops and its state.
 * Swipe right to reply; long-press for the message menu.
 */
export function BubbleRow({ item, first, showSent }: BubbleRowProps) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const reduce = useReduceMotion();
  const room = useRoom();
  const x = useSharedValue(0);
  const crossed = useSharedValue(false);
  const shake = useShake(item.delivery === 'failed');
  const person = item.actor ? room.people.get(item.actor) : undefined;
  const canAct = item.seq !== null;
  const reply = () => room.reply(item);
  // The menu opens over the bubble where it sits, so it is told the bubble's top on screen.
  const bubble = useAnimatedRef<Animated.View>();
  const menu = (top: number | null) => room.openMenu(item, top);
  const tick = () => haptics.select();
  const pan = usePanGesture({
    enabled: canAct,
    activeOffsetX: 14,
    failOffsetX: -10,
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      const tx = Math.max(0, e.translationX);
      x.set(tx < REPLY_AT ? tx : REPLY_AT + (tx - REPLY_AT) * 0.25);
      const over = tx >= REPLY_AT;
      if (over !== crossed.get()) {
        crossed.set(over);
        if (over) scheduleOnRN(tick);
      }
    },
    onDeactivate: () => {
      'worklet';
      if (crossed.get()) scheduleOnRN(reply);
      crossed.set(false);
      x.set(reduce ? fadeTo(0) : sheetTo(0, false));
    },
  });
  const long = useLongPressGesture({
    enabled: canAct,
    minDuration: 350,
    onActivate: () => {
      'worklet';
      const box = measure(bubble);
      scheduleOnRN(haptics.tap);
      scheduleOnRN(menu, box === null ? null : box.pageY);
    },
  });
  const gesture = useExclusiveGestures(pan, long);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const hint = useAnimatedStyle(() => ({ opacity: Math.min(1, x.get() / REPLY_AT) }));
  // A quiet note carries its writer's name in its own header.
  const showName = !item.mine && first && !room.visit && item.body.kind !== 'quiet_note';
  const label = useBubbleSpeech(item, showSent);
  const retryable = item.delivery === 'failed' && refusalOf(item.refused ?? '').retry;
  const actions = [
    ...(canAct
      ? [
          { name: 'reply', label: t('chat.bubble.swipeReply') },
          { name: 'longpress', label: t('chat.bubble.actions') },
          {
            name: 'dewdrop',
            label: item.myDew !== null ? t('chat.bubble.dewdropOff') : t('chat.bubble.dewdropOn'),
          },
        ]
      : []),
    ...(retryable ? [{ name: 'retry', label: t('chat.bubble.tryAgain') }] : []),
  ];

  const column = (
    <View
      style={{
        gap: 4,
        alignItems: item.mine ? 'flex-end' : 'flex-start',
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      {showName ? (
        <Txt variant="bubbleName" color={palette.muted} style={{ paddingLeft: 10 }}>
          {room.nameOf(item.actor)}
        </Txt>
      ) : null}
      <Animated.View ref={bubble} style={shake}>
        <BubbleBody item={item} />
      </Animated.View>
      <ReactionRow item={item} />
      {item.mine || item.edited ? <StateLine item={item} showSent={showSent} /> : null}
    </View>
  );
  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', left: 4, top: 0, bottom: 0, justifyContent: 'center' },
          hint,
        ]}
      >
        <ArtIcon name="reply" size={22} color={palette.secondary} />
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          // One element for VoiceOver: who, what and how it stands, with its actions on it.
          accessible
          accessibilityLabel={label}
          accessibilityActions={actions}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === 'reply') reply();
            if (name === 'longpress') menu(null);
            if (name === 'dewdrop') room.toggleDew(item);
            if (name === 'retry') room.retry(item);
          }}
          style={[
            item.mine
              ? { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: '86%' }
              : { flexDirection: 'row', gap: 8, alignItems: 'flex-end', maxWidth: '92%' },
            slide,
          ]}
        >
          {!item.mine ? (
            first && person?.critter ? (
              <CritterFace
                farm={room.farm}
                seq={item.seq}
                person={item.actor ?? ''}
                kind={person.critter.species}
                look={lookOf(person.critter)}
                label={room.nameOf(item.actor)}
              />
            ) : (
              <View style={{ width: 30 }} />
            )
          ) : null}
          {column}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** What VoiceOver says for a bubble: who, what it says, and how it stands. */
function useBubbleSpeech(item: BubbleItem, showSent: boolean): string {
  const { t } = useLocale();
  const room = useRoom();
  const who = item.mine ? t('chat.you') : room.nameOf(item.actor);
  const body = item.body;
  const what =
    body.kind === 'message' || body.kind === 'quiet_note'
      ? body.text
      : body.kind === 'voice'
        ? t('chat.what.voice', { duration: clock(body.voice.durationMs) })
        : body.kind === 'link'
          ? `${body.link.text ?? ''} ${body.link.preview?.title ?? body.link.url}`.trim()
          : body.kind === 'media'
            ? (body.media.caption ?? t('chat.what.photo'))
            : t('chat.what.sticker');
  const state =
    item.delivery === 'failed'
      ? t(refusalOf(item.refused ?? '').copy)
      : item.delivery === 'sending'
        ? t('chat.bubble.sending')
        : item.edited
          ? t('chat.bubble.edited')
          : item.delivery === 'sent' && showSent
            ? t('chat.bubble.sent')
            : '';
  return [who, what, state].filter((part) => part !== '').join(', ');
}
