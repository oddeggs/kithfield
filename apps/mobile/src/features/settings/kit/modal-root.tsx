import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * A native sheet or cover is its own window: touches inside it reach the gesture handlers only
 * under a root of their own. A cover fills the screen; a sheet sizes to what it holds.
 */
export function ModalRoot({
  children,
  sheet = false,
}: {
  readonly children: ReactNode;
  readonly sheet?: boolean;
}) {
  return (
    <GestureHandlerRootView style={sheet ? undefined : { flex: 1 }}>
      {children}
    </GestureHandlerRootView>
  );
}
