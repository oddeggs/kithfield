import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ArtProvider, createArtStore } from '../ui/art/art-provider';
import { ToastHost } from '../ui/components/toast';
import { LocaleProvider } from '../ui/locale/locale-provider';
import { ReduceMotionProvider } from '../ui/motion/reduce-motion';
import { TabActivityProvider } from '../ui/tab-bar/tab-activity';
import { ThemeProvider, useTheme } from '../ui/theme/theme-provider';

// The splash stays up until the first frame can be drawn whole: the theme fonts are embedded
// natively (expo-font's config plugin), so what is waited for is the art and the first layout.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 200, fade: true });

export const unstable_settings = { initialRouteName: '(tabs)' };

function Screens() {
  const { appearance, palette } = useTheme();
  return (
    <>
      <StatusBar style={appearance === 'night' ? 'light' : 'dark'} animated />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(dev)/gallery" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

/**
 * The farm's data reaches every screen from here once the data layer lands: wrap `children` in
 * `<DataProvider>` (started with `startData(rules)`) at this point, inside the theme and the art
 * so its loading and error states can draw, and outside the screens.
 */
function DataSlot({ children }: { readonly children: ReactNode }) {
  return children;
}

export default function RootLayout() {
  // The renderer is made once, on the fonts the system already has registered.
  const [art] = useState(() => createArtStore());
  const ready = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);
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
                      <View style={{ flex: 1 }} onLayout={ready}>
                        <Screens />
                      </View>
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
