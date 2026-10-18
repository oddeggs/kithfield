import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { ScrollViewProps } from 'react-native';
import { GestureDetector, useNativeGesture, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedScrollHandler,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

/** What a sheet shares with the one scrolling list inside it. */
export interface SheetScrollContext {
  pan: PanGesture;
  /** The list's offset: the sheet follows a downward drag only once the list is at its top. */
  scrollY: SharedValue<number>;
  /** Held at the top while the sheet itself is moving. */
  scrollRef: AnimatedRef<Animated.ScrollView>;
  hasScroll: SharedValue<boolean>;
}

export const SheetScroll = createContext<SheetScrollContext | null>(null);

/**
 * A list inside a sheet. It scrolls with the same finger that moves the sheet: dragging up grows
 * the sheet to its highest stop and then scrolls; dragging down scrolls back to the top and then
 * lowers the sheet. Use at most one per sheet.
 */
export function SheetScrollView({
  children,
  ...props
}: Omit<ScrollViewProps, 'onScroll' | 'bounces' | 'ref'> & { readonly children: ReactNode }) {
  const sheet = useContext(SheetScroll);
  if (sheet === null) throw new Error('SheetScrollView goes inside a Sheet');
  const { pan, scrollY, scrollRef, hasScroll } = sheet;
  useEffect(() => {
    hasScroll.set(true);
    return () => hasScroll.set(false);
  }, [hasScroll]);
  const native = useNativeGesture({ simultaneousWith: pan });
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  return (
    <GestureDetector gesture={native}>
      <Animated.ScrollView
        {...props}
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // The sheet, not the list, answers a pull past the top.
        bounces={false}
      >
        {children}
      </Animated.ScrollView>
    </GestureDetector>
  );
}
