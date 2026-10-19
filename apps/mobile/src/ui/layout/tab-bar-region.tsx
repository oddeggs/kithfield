import { screens } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

/**
 * Keeps the floating tab bar a phone's width on a wider window, centred over the stretch of the
 * window it serves (the whole window, or the chat beside an opened foldable's farm). The bar
 * places itself at the region's foot, as it does on the window's.
 */
export function TabBarRegion({
  left = 0,
  children,
}: {
  /** Where the stretch the bar serves begins, from the window's leading edge. */
  readonly left?: number;
  readonly children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const span = width - left;
  const barWidth = Math.min(span, screens.tabBarMaxWidth);
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: left + (span - barWidth) / 2,
        width: barWidth,
      }}
    >
      {children}
    </View>
  );
}
