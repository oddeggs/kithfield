import { motion } from '@kithfield/theme';
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
import { Txt } from '../../../ui/type/text';
import { lookOf } from '../model/people';
import type { BubbleItem } from '../model/timeline';
import { useChatColours } from '../ui/chat-colours';
import { BubbleBody } from './bubbles';
import { Reactions } from './reactions';
import { useRoom } from './room-context';

/** New messages rise this far as they fade in, over `RISE_MS` (04-03). */
const RISE = 12;
const RISE_MS = 180;
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
  const y = useSharedValue(fresh && !reduce ? RISE : 0);
  useEffect(() => {
    if (!fresh) return;
    const ease = { duration: RISE_MS, easing: Easing.bezier(...motion.fade.bezier) };
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
  const small = { fontSize: 11.5, lineHeight: 12, fontWeight: '500' as const };
  if (item.delivery === 'failed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt variant="bubbleState" color={colours.failInk} style={{ fontSize: 12.5 }}>
          {t('chat.bubble.didntSend')}
        </Txt>
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

/** A failed bubble shakes once, 3 points (04-15). */
function useShake(failed: boolean) {
  const reduce = useReduceMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!failed || reduce) return;
    const step = { duration: 60 };
    x.set(
      withSequence(
        withTiming(-3, step),
        withTiming(3, step),
        withTiming(-2, step),
        withTiming(0, step),
      ),
    );
  }, [failed, reduce, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
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
  const menu = () => room.openMenu(item);
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
      scheduleOnRN(haptics.tap);
      scheduleOnRN(menu);
    },
  });
  const gesture = useExclusiveGestures(pan, long);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const hint = useAnimatedStyle(() => ({ opacity: Math.min(1, x.get() / REPLY_AT) }));
  // A quiet note carries its writer's name in its own header.
  const showName = !item.mine && first && !room.visit && item.body.kind !== 'quiet_note';
  const label = `${item.mine ? t('chat.you') : room.nameOf(item.actor)}`;

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
      <Animated.View style={shake}>
        <BubbleBody item={item} />
      </Animated.View>
      <Reactions item={item} />
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
          accessible={false}
          accessibilityActions={
            canAct
              ? [
                  { name: 'reply', label: t('chat.bubble.swipeReply') },
                  { name: 'longpress', label: t('chat.bubble.actions') },
                ]
              : []
          }
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'reply') reply();
            if (e.nativeEvent.actionName === 'longpress') menu();
          }}
          accessibilityLabel={label}
          style={[
            item.mine
              ? { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: '86%' }
              : { flexDirection: 'row', gap: 8, alignItems: 'flex-end', maxWidth: '92%' },
            slide,
          ]}
        >
          {!item.mine ? (
            first && person?.critter ? (
              <Avatar
                kind={person.critter.species}
                look={lookOf(person.critter)}
                size={30}
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
