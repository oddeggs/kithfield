import { useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/*
 * Android's layer for a first-run tip: one slot drawn over every screen and sheet, from the root
 * of the app, the way iOS's window-wide overlay shows it. Unlike a dialog window it lets the screen
 * under the tip keep its touches, so the person can try what the tip points at.
 */

let shown: ReactNode = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Puts `node` in the layer, in place of whatever was there; null empties it. */
export function setHintLayer(node: ReactNode): void {
  shown = node;
  for (const listener of listeners) listener();
}

/** The layer itself, after the screens in the root layout. */
export function HintLayerHost() {
  const node = useSyncExternalStore(subscribe, () => shown);
  if (node === null) return null;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {node}
    </View>
  );
}
