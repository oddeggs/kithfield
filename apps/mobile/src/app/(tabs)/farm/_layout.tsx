import { Stack } from 'expo-router';

import { useTheme } from '../../../ui/theme/theme-provider';

/**
 * The Farm tab's stack. The farm's moments (welcome back, move-in, removal, leaving) cover the
 * screen; your bubble is a short sheet that leaves the farm and its bubbles in view.
 */
export default function FarmStack() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}
    >
      <Stack.Screen
        name="bubble"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.42],
          sheetGrabberVisible: true,
          sheetCornerRadius: 30,
          // The farm and its bubbles stay bright above it.
          sheetLargestUndimmedDetentIndex: 0,
          contentStyle: { backgroundColor: palette.sheet },
        }}
      />
      <Stack.Screen
        name="welcome"
        options={{ presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen
        name="move-in"
        options={{ presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen
        name="removed"
        options={{ presentation: 'fullScreenModal', animation: 'fade' }}
      />
      <Stack.Screen name="leave" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
