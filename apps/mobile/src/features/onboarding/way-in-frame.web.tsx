import { usePathname } from 'expo-router';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useWindowDimensions, View, type ScaledSize } from 'react-native';

import { useTheme } from '../../ui/theme/theme-provider';
import { platformLook } from '../../web/look';

const ColumnContext = createContext<ScaledSize | null>(null);

/**
 * In a browser wider than a phone, the way in keeps the phone's screens in a phone-wide column
 * in the middle of the window, on the page's paper or night sky: its scenes are drawn for a
 * phone, and stretched across a desktop window they lose their shape. The web join (an invite
 * opened in the browser) has its own desktop layout and keeps the whole window.
 */
export function WayInFrame({ children }: { readonly children: ReactNode }) {
  const window = useWindowDimensions();
  const { palette } = useTheme();
  const path = usePathname();
  const column = window.width > platformLook.wayInWidth && !path.startsWith('/i/');
  const size = useMemo(
    () => (column ? { ...window, width: platformLook.wayInWidth } : null),
    [column, window],
  );
  if (!size) return children;
  return (
    <ColumnContext.Provider value={size}>
      <View style={{ flex: 1, alignItems: 'center', backgroundColor: palette.background }}>
        <View style={{ flex: 1, width: size.width, overflow: 'hidden' }}>{children}</View>
      </View>
    </ColumnContext.Provider>
  );
}

/** The size the way in's screens lay out in: the column's in a wide window, else the window's. */
export function useWayInWindow(): ScaledSize {
  const window = useWindowDimensions();
  return useContext(ColumnContext) ?? window;
}
