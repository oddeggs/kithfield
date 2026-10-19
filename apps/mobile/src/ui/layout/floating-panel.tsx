import { motion, screens } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '../theme/theme-provider';
import { NO_EDGES, PaneProvider } from './pane';

const panel = screens.floatingChat;

/**
 * A pane floating at the trailing side of a full-window scene (the large-screen farm's chat,
 * `14 Platforms`): rounded, lifted on a soft shadow, and clear of the window's edges, so what it
 * shows sees no safe area of its own.
 */
export function FloatingPanel({
  expand,
  children,
}: {
  /** Opens what the panel shows in full, from its title. */
  readonly expand?: { readonly label: string; readonly onPress: () => void };
  readonly children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const { palette } = useTheme();
  const inner = height - panel.top - panel.bottom;
  return (
    <Animated.View
      entering={FadeIn.duration(motion.fade.durationMs)}
      exiting={FadeOut.duration(motion.fade.durationMs)}
      style={{
        position: 'absolute',
        right: panel.side,
        top: panel.top,
        bottom: panel.bottom,
        width: panel.width,
        borderRadius: panel.radius,
        boxShadow: panel.shadow,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: panel.radius,
          overflow: 'hidden',
          backgroundColor: palette.background,
        }}
      >
        <PaneProvider
          pane={{
            width: panel.width,
            height: inner,
            chrome: 'flat',
            back: false,
            ...(expand ? { expand } : {}),
          }}
          edges={NO_EDGES}
        >
          {children}
        </PaneProvider>
      </View>
    </Animated.View>
  );
}
