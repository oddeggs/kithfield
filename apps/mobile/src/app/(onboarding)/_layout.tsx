import { Stack } from 'expo-router';

import { FlowProvider } from '../../features/onboarding/flow-state';
import { useTheme } from '../../ui/theme/theme-provider';

/** The way in: its own stack, shown instead of the tabs until the person is onboarded. */
export default function OnboardingStack() {
  const { palette } = useTheme();
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
