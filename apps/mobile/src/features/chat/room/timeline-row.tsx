import { memo, useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useChatColours } from '../ui/chat-colours';
import type { TimelineItem } from '../model/timeline';
import { BackCard, DayDivider, GestureLine, UnsentLine } from './lines';
import { BubbleRow, Rise } from './message-row';
import { useRoom } from './room-context';

/** A shown message lights up a moment, then fades back. */
function Lit({ on, children }: { readonly on: boolean; readonly children: React.ReactNode }) {
  const colours = useChatColours();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (on) {
      glow.set(1);
      glow.set(withTiming(0, { duration: 1400 }));
    }
  }, [on, glow]);
  const style = useAnimatedStyle(() => ({
    borderRadius: 22,
    backgroundColor: colours.mark,
    position: 'absolute',
    left: -8,
    right: -8,
    top: -4,
    bottom: -4,
    opacity: glow.get() * 0.6,
  }));
  return (
    <>
      <Animated.View pointerEvents="none" style={style} />
      {children}
    </>
  );
}

/** One row of the chat, by what it is. */
export const TimelineRow = memo(function TimelineRow({
  item,
  now,
  first,
  last,
  showSent,
  lit,
}: {
  readonly item: TimelineItem;
  readonly now: number;
  readonly first: boolean;
  readonly last: boolean;
  readonly showSent: boolean;
  readonly lit: boolean;
}) {
  const { isNew } = useRoom();
  const body = (() => {
    switch (item.type) {
      case 'day':
        return <DayDivider at={item.at} now={now} />;
      case 'bubble':
        return <BubbleRow item={item} first={first} last={last} showSent={showSent} />;
      case 'unsent':
        return <UnsentLine actor={item.actor} by={item.by} />;
      case 'line':
        return <GestureLine kind={item.kind} actor={item.actor} to={item.to} title={item.title} />;
      case 'back':
        return <BackCard actor={item.actor} />;
    }
  })();
  return (
    <Rise fresh={isNew(item.key)}>
      <Lit on={lit}>{body}</Lit>
    </Rise>
  );
});
