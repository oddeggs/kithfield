import { Stack } from 'expo-router';

import { useTheme } from '../../ui/theme/theme-provider';

/** The way in, for someone not signed in: its own stack, shown instead of the tabs. */
export default function OnboardingStack() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}
    />
  );
}
