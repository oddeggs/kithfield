import { platformMotion } from '@kithfield/theme';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useCottage } from '../../data';
import { useReduceMotion } from '../../ui/motion/reduce-motion';
import { useTheme } from '../../ui/theme/theme-provider';
import { platformLook } from '../look';
import { DeskContext, openChat } from './desk-context';
import { DeskFarm } from './desk-farm';
import { DeskFire } from './desk-fire';
import { DeskList } from './desk-list';
import { DesktopHost } from '../desktop/desktop-host';
import { inDesktop } from '../desktop/tauri';
import { DeskKeys } from './desk-keys';

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
  // The farm whose fire you sit by, while you do: it stays as you move between chats.
  const [fireFarm, setFireFarm] = useState<string | null>(null);
  const reduce = useReduceMotion();
  const [desktop] = useState(inDesktop);

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

  const desk = useMemo(
    () => ({
      wide,
      farm,
      fire: fireFarm !== null,
      setFire: (on: boolean) => setFireFarm(on ? farm : null),
    }),
    [wide, farm, fireFarm],
  );
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
            {/* The fire room takes the farm's place while you sit by it, cross-fading. */}
            <Animated.View
              key={fireFarm ?? `farm:${farm}`}
              style={{ flex: 1 }}
              {...(reduce
                ? {}
                : {
                    entering: FadeIn.duration(platformMotion.paneSwapMs),
                    exiting: FadeOut.duration(platformMotion.paneSwapMs),
                  })}
            >
              {fireFarm ? <DeskFire farm={fireFarm} /> : <DeskFarm farm={farm} />}
            </Animated.View>
          </View>
        ) : null}
        {wide ? <DeskKeys /> : null}
        {desktop ? <DesktopHost /> : null}
      </View>
    </DeskContext.Provider>
  );
}
