import { chatMotion } from '@kithfield/theme';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, type ListViewToken } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  type SharedValue,
} from 'react-native-reanimated';

import { rowIndexOf } from '../model/rows';
import type { TimelineItem } from '../model/timeline';
import { runsOf } from './room-people';
import { TimelineRow } from './timeline-row';

/** Asks the list to show a message, by seq; `id` makes asking twice for one seq count. */
export interface JumpRequest {
  readonly seq: number;
  readonly id: number;
}

export interface TimelineListProps {
  /** Oldest first, as the timeline folds them. */
  readonly rows: readonly TimelineItem[];
  readonly now: number;
  /** Older history: whether more can be paged in, and how. */
  readonly older: 'idle' | 'loading' | 'done';
  readonly loadOlder: () => void;
  /** Room above the oldest row (under the farm) and below the newest (over the composer). */
  readonly topSpace: number;
  readonly bottomSpace: number;
  /** How far the chat has scrolled back from its newest row; the header follows it. */
  readonly scrollY: SharedValue<number>;
  readonly jump: JumpRequest | null;
  /** Drawn above the oldest row ("Earlier", the visit's privacy line) and below the newest (typing). */
  readonly top: ReactNode;
  readonly bottom: ReactNode;
  /** Bump to bring the newest row into view (after sending). */
  readonly toNewest: number;
}

const Gap = () => <View style={{ height: 12 }} />;

/**
 * The chat, newest at the bottom: an inverted list, so opening a chat starts at its newest row
 * without a jump, older history pages in above, and a message asked for by seq is paged to,
 * scrolled to once measured, and lit only once it's on screen.
 */
export function TimelineList(props: TimelineListProps) {
  const { rows, now, older, loadOlder, topSpace, bottomSpace, scrollY, jump, top, bottom } = props;
  const list = useAnimatedRef<Animated.FlatList<TimelineItem>>();
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const runs = useMemo(() => {
    const r = runsOf(rows);
    return new Map(rows.map((row, i) => [row.key, r[i]?.first ?? true]));
  }, [rows]);
  const lastSent = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const r = rows[i];
      if (r?.type === 'bubble' && r.mine && r.delivery === 'sent') return r.key;
    }
    return null;
  }, [rows]);

  // Rows that land after the chat opened rise in; what was there, or paged in, just sits.
  const openedAt = useRef<number | null>(null);
  if (openedAt.current === null && rows.length > 0) {
    openedAt.current = rows.reduce((at, r) => (r.type === 'bubble' ? Math.max(at, r.at) : at), 0);
  }
  const fresh = useCallback(
    (row: TimelineItem) =>
      openedAt.current !== null && row.type === 'bubble' && row.at > openedAt.current,
    [],
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
  });

  // A message asked for: page back until it's loaded, then scroll to it once rows are measured.
  const wanted = useRef<number | null>(null);
  const tries = useRef(0);
  const litKey = useRef<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  useEffect(() => {
    if (jump) {
      wanted.current = jump.seq;
      tries.current = 0;
    }
  }, [jump]);
  const scrollTo = useCallback(
    (index: number) => {
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    },
    [list],
  );
  useEffect(() => {
    const target = wanted.current;
    if (target === null || newestFirst.length === 0) return;
    const index = rowIndexOf(newestFirst, target);
    if (index < 0) {
      if (older === 'done') wanted.current = null;
      else if (older === 'idle') loadOlder();
      return;
    }
    wanted.current = null;
    litKey.current = newestFirst[index]?.key ?? null;
    scrollTo(index);
  }, [newestFirst, older, loadOlder, scrollTo, jump]);

  // Lit only once it's actually on screen, then it fades.
  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const key = litKey.current;
    if (key === null || !viewableItems.some((v) => v.key === key)) return;
    litKey.current = null;
    setLit(key);
    setTimeout(() => setLit((k) => (k === key ? null : k)), chatMotion.glowMs);
  }).current;

  useEffect(() => {
    if (props.toNewest > 0) list.current?.scrollToOffset({ offset: 0, animated: true });
  }, [props.toNewest, list]);

  return (
    <Animated.FlatList
      ref={list}
      inverted
      data={newestFirst}
      keyExtractor={(item) => item.key}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      // A new message at the newest end keeps the view where it is while reading further back.
      maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: 120 }}
      onEndReached={() => {
        if (older === 'idle') loadOlder();
      }}
      onEndReachedThreshold={0.6}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      onViewableItemsChanged={onViewable}
      onScrollToIndexFailed={(info) => {
        // Rows aren't measured yet: get near, then try again once they are.
        list.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: false,
        });
        if (tries.current < 4) {
          tries.current += 1;
          setTimeout(() => scrollTo(info.index), 120);
        }
      }}
      // Inverted: the content's top padding sits under the newest row, its bottom over the oldest.
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'flex-end',
        paddingTop: bottomSpace,
        paddingBottom: topSpace,
        paddingHorizontal: 14,
      }}
      ItemSeparatorComponent={Gap}
      ListHeaderComponent={<>{bottom}</>}
      ListFooterComponent={<>{top}</>}
      renderItem={({ item }) => (
        <TimelineRow
          item={item}
          now={now}
          first={runs.get(item.key) ?? true}
          showSent={item.key === lastSent}
          lit={item.key === lit}
          fresh={fresh(item)}
        />
      )}
    />
  );
}
