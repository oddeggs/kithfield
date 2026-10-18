import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ArtProvider, createArtStore } from '../ui/art/art-provider';
import { ToastHost } from '../ui/components/toast';
import { LocaleProvider } from '../ui/locale/locale-provider';
import { ReduceMotionProvider } from '../ui/motion/reduce-motion';
import { presentationFor } from '../ui/navigation/presentation';
import { SessionProvider, signedOut, useSession } from '../ui/session/session';
import { TabActivityProvider } from '../ui/tab-bar/tab-activity';
import { ThemeProvider, useTheme } from '../ui/theme/theme-provider';

// The splash stays up until the first frame can be drawn whole: the theme fonts are embedded
// natively (expo-font's config plugin), so what is waited for is the session, the art and the
// first layout.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

function Screens() {
  const { appearance, palette } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  return (
    <>
      <StatusBar style={appearance === 'night' ? 'light' : 'dark'} animated />
      <Stack
        // A feature adds a sheet with `app/(modal)/…` or a full-screen cover with `app/(cover)/…`;
        // see `app/README.md`.
        screenOptions={({ route }) => ({
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          presentation: presentationFor(route.name),
        })}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={__DEV__}>
          <Stack.Screen name="(dev)/gallery" />
        </Stack.Protected>
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

/**
 * The session and the farm's data reach every screen from here. At integration the data layer's
 * providers go in this slot: its session client (as the `session` below) and `<DataProvider>`.
 * `startData(rules)` is async, so the slot reports `loading` until the client has resolved, and the
 * splash stays up until then. It sits inside the theme and the art, so loading and error states
 * can draw, and outside the screens.
 */
function DataSlot({ children }: { readonly children: ReactNode }) {
  return <SessionProvider session={signedOut}>{children}</SessionProvider>;
}

/** Hides the splash once the session is known and the first frame has laid out. */
function SplashGate({ children }: { readonly children: ReactNode }) {
  const { status } = useSession();
  const [laidOut, setLaidOut] = useState(false);
  const onLayout = useCallback(() => setLaidOut(true), []);
  useEffect(() => {
    if (laidOut && status !== 'loading') void SplashScreen.hideAsync();
  }, [laidOut, status]);
  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {children}
    </View>
  );
}

export default function RootLayout() {
  // The renderer is made once, on the fonts the system already has registered.
  const [art] = useState(() => createArtStore());
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ReduceMotionProvider>
          <LocaleProvider>
            <ThemeProvider>
              <ArtProvider store={art}>
                <TabActivityProvider>
                  <ToastHost>
                    <DataSlot>
                      <SplashGate>
                        <Screens />
                      </SplashGate>
                    </DataSlot>
                  </ToastHost>
                </TabActivityProvider>
              </ArtProvider>
            </ThemeProvider>
          </LocaleProvider>
        </ReduceMotionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
