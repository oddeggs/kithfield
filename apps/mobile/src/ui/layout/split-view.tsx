import { motion, screens } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/theme-provider';
import { PaneProvider } from './pane';
import { hasFarmPane, hasSidebar, paneWidths, type LayoutKind } from './size-class';

const fadeIn = FadeIn.duration(motion.fade.durationMs);
const fadeOut = FadeOut.duration(motion.fade.durationMs);

/**
 * Up to three panes side by side (`14 Platforms`): a leading pane, the main one, and a trailing
 * one, each as wide as the layout says. The main pane keeps its place in the tree whatever the
 * layout, so what it shows (a navigator and its screens) carries on as the window resizes; the
 * panes either side fade in and out as the window crosses a breakpoint, and the main pane simply
 * takes the room they leave.
 */
export function SplitView({
  kind,
  leading,
  trailing,
  children,
}: {
  readonly kind: LayoutKind;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const { palette } = useTheme();
  const w = paneWidths(kind, width);
  const showLeading = w.leading > 0 && leading !== undefined && leading !== null;
  const showTrailing = w.trailing > 0 && trailing !== undefined && trailing !== null;
  const rule = { borderColor: palette.hairline };
  // A rail of system controls down the trailing side (a foldable) stays clear of the chat.
  const railInset = useSafeAreaInsets().right;
  const clearRail = !showTrailing && railInset >= screens.rail.minInset;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.background }}>
      {showLeading ? (
        <Animated.View
          entering={fadeIn}
          exiting={fadeOut}
          style={[
            { width: w.leading, height, overflow: 'hidden' },
            // A sidebar ends on a hairline; a farm runs up to the fold.
            hasSidebar(kind) ? [{ borderRightWidth: 1 }, rule] : null,
          ]}
        >
          <PaneProvider
            pane={{ width: w.leading, height, chrome: 'art', back: false }}
            edges={{ top: true, bottom: true, left: true, right: false }}
          >
            {leading}
          </PaneProvider>
        </Animated.View>
      ) : null}
      <View
        style={{
          flex: 1,
          paddingLeft: showLeading ? w.gutter : 0,
          paddingRight: clearRail ? railInset : 0,
        }}
      >
        <PaneProvider
          pane={{
            width:
              width -
              (showLeading ? w.leading + w.gutter : 0) -
              (showTrailing ? w.trailing : 0) -
              (clearRail ? railInset : 0),
            height,
            // Beside a farm of its own, a chat needn't draw the farm over itself.
            chrome:
              hasFarmPane(kind) && (showTrailing || (kind === 'pair' && showLeading))
                ? 'flat'
                : 'art',
            back: !hasSidebar(kind),
          }}
          edges={{
            top: true,
            bottom: true,
            left: !showLeading,
            right: !showTrailing && !clearRail,
          }}
        >
          {children}
        </PaneProvider>
      </View>
      {showTrailing ? (
        <Animated.View
          entering={fadeIn}
          exiting={fadeOut}
          style={[{ width: w.trailing, height, overflow: 'hidden', borderLeftWidth: 1 }, rule]}
        >
          <PaneProvider
            pane={{ width: w.trailing - 1, height, chrome: 'art', back: false }}
            edges={{ top: true, bottom: true, left: false, right: true }}
          >
            {trailing}
          </PaneProvider>
        </Animated.View>
      ) : null}
    </View>
  );
}
