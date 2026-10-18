import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { ViewStyleProp } from '../../../ui/style';

/**
 * A native sheet or cover is its own window: touches inside it reach the gesture handlers only
 * under a root of their own.
 */
export function ModalRoot({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: ViewStyleProp;
}) {
  return <GestureHandlerRootView style={style ?? { flex: 1 }}>{children}</GestureHandlerRootView>;
}
