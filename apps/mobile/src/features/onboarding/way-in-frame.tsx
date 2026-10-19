import type { ReactNode } from 'react';
import { useWindowDimensions, type ScaledSize } from 'react-native';

/** The way in fills the phone's window. */
export function WayInFrame({ children }: { readonly children: ReactNode }) {
  return children;
}

/** The size the way in's screens lay out in: the window's, on the phone. */
export function useWayInWindow(): ScaledSize {
  return useWindowDimensions();
}
