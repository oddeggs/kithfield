import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

import { layoutFor, type LayoutKind } from './size-class';

/** How the app lays out in the window as it is now; it changes as the window resizes. */
export function useScreenLayout(): LayoutKind {
  const { width, height } = useWindowDimensions();
  return layoutFor({ width, height, pad: Platform.OS === 'ios' && Platform.isPad });
}

/**
 * Whether the app is a window smaller than the screen (an iPad window beside others, or resized),
 * where the system draws its window controls over the app's top leading corner.
 */
export function useWindowed(): boolean {
  const { width, height } = useWindowDimensions();
  const screen = Dimensions.get('screen');
  return (
    Platform.OS === 'ios' && Platform.isPad && (width < screen.width || height < screen.height)
  );
}

/**
 * What a screen shown in a pane needs to know about it: its size (the window's, on a phone), and
 * how a chat in it dresses its top. `art` is the phone's: the farm drawn over the chat. `flat` is a
 * plain header, where the farm already has a column (or a whole screen) of its own.
 */
export interface Pane {
  readonly width: number;
  readonly height: number;
  readonly chrome: 'art' | 'flat';
  /** Whether a chat in the pane offers a way back to the chat list (no list beside it). */
  readonly back: boolean;
  /** A panel floating over a scene opens what it shows in full this way, from its title. */
  readonly expand?: { readonly label: string; readonly onPress: () => void };
}

const PaneContext = createContext<Pane | null>(null);

/** The pane a screen is shown in; the whole window, with the phone's chrome, outside any pane. */
export function usePane(): Pane {
  const pane = useContext(PaneContext);
  const { width, height } = useWindowDimensions();
  return pane ?? { width, height, chrome: 'art', back: true };
}

/**
 * Shows its screens in a pane: they size to it, and see only the safe-area edges the pane
 * touches (a floating panel touches none).
 */
export function PaneProvider({
  pane,
  edges,
  children,
}: {
  readonly pane: Pane;
  /** Which of the window's safe-area edges reach into the pane. */
  readonly edges: Readonly<Record<keyof EdgeInsets, boolean>>;
  readonly children: ReactNode;
}) {
  const window = useSafeAreaInsets();
  const { top, right, bottom, left } = edges;
  const insets = useMemo(
    () => ({
      top: top ? window.top : 0,
      right: right ? window.right : 0,
      bottom: bottom ? window.bottom : 0,
      left: left ? window.left : 0,
    }),
    [window.top, window.right, window.bottom, window.left, top, right, bottom, left],
  );
  const { width, height, chrome, back, expand } = pane;
  const value = useMemo(
    () => ({ width, height, chrome, back, ...(expand ? { expand } : {}) }),
    [width, height, chrome, back, expand],
  );
  return (
    <PaneContext.Provider value={value}>
      <SafeAreaInsetsContext.Provider value={insets}>{children}</SafeAreaInsetsContext.Provider>
    </PaneContext.Provider>
  );
}

/** Every edge of the window. */
export const ALL_EDGES = { top: true, right: true, bottom: true, left: true } as const;
/** No edge: a panel floating inside the window. */
export const NO_EDGES = { top: false, right: false, bottom: false, left: false } as const;
