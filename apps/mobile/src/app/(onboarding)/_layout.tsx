import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { clockSunPlace } from '../../features/onboarding/clock-place';
import { FlowProvider } from '../../features/onboarding/flow-state';
import { useSunPlace, useTheme } from '../../ui/theme/theme-provider';

/** Entering the group (a redirect, a cold start) opens on the gate, under any deeper screen. */
export const unstable_settings = { anchor: 'welcome' };

/** The way in: its own stack, shown instead of the tabs until the person is onboarded. */
export default function OnboardingStack() {
  const { palette } = useTheme();
  // Before there is a farm, night follows the sunset the phone's clock gives (never its location),
  // as the farm's follows its town's.
  const [place] = useState(() => clockSunPlace(Date.now(), getLocales()[0]?.regionCode));
  useSunPlace(place);
  return (
    <FlowProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen
          name="invite"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.42],
            sheetGrabberVisible: true,
            sheetCornerRadius: 30,
            contentStyle: { backgroundColor: palette.sheet },
          }}
        />
        {/* Under age there is no way back into the form. */}
        <Stack.Screen name="too-young" options={{ gestureEnabled: false }} />
      </Stack>
    </FlowProvider>
  );
}
