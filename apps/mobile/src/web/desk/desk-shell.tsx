import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useCottage } from '../../data';
import { useTheme } from '../../ui/theme/theme-provider';
import { platformLook } from '../look';
import { DeskFarm } from './desk-farm';
import { DeskList } from './desk-list';
import { DeskKeys } from './desk-keys';

/** The desktop's shared state: the farm the panes are on, and the right pane's mode. */
export interface Desk {
  readonly wide: boolean;
  /** The farm or visit the chat and the live farm show, or null before there is one. */
  readonly farm: string | null;
  /** Sitting by the fire: the right pane shows the fire room instead of the farm. */
  readonly fire: boolean;
  readonly setFire: (on: boolean) => void;
}

const DeskContext = createContext<Desk>({
  wide: false,
  farm: null,
  fire: false,
  setFire: () => undefined,
});

export const useDesk = (): Desk => useContext(DeskContext);

/** Opens a farm's chat in the middle pane. */
export const openChat = (farm: string) =>
  router.navigate({ pathname: '/(tabs)/chat/[farm]', params: { farm } });

/**
 * The desktop's three panes (`14 Platforms`, 14-11): the farms and visits, the screen the route
 * shows (the chat, mostly), and the chosen farm alive, or the fire room while you sit by it.
 * Narrow, only the middle shows, and the tabs keep their bar.
 */
export function DeskShell({
  wide,
  children,
}: {
  readonly wide: boolean;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ farm?: string }>();
  const { chats } = useCottage();
  const [chosen, setChosen] = useState<string | null>(null);
  const [fire, setFire] = useState(false);

  // The farm in the route wins; elsewhere (settings, the seed bed) the panes keep the last one.
  const routed =
    pathname.startsWith('/chat/') && typeof params.farm === 'string' ? params.farm : null;
  useEffect(() => {
    if (routed !== null) setChosen(routed);
  }, [routed]);
  const farm = routed ?? chosen ?? chats[0]?.farm ?? null;

  // On the desktop the farm lives in its own pane, so opening the app lands on the chat.
  useEffect(() => {
    if (wide && pathname === '/farm' && farm !== null) openChat(farm);
  }, [wide, pathname, farm]);

  const desk = useMemo(() => ({ wide, farm, fire, setFire }), [wide, farm, fire]);
  return (
    <DeskContext.Provider value={desk}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.background }}>
        {wide ? <DeskList farm={farm} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        {wide && farm !== null ? (
          <View
            style={{
              width: platformLook.farmWidth,
              borderLeftWidth: 1,
              borderColor: palette.hairline,
              overflow: 'hidden',
            }}
          >
            <DeskFarm farm={farm} />
          </View>
        ) : null}
        {wide ? <DeskKeys /> : null}
      </View>
    </DeskContext.Provider>
  );
}
