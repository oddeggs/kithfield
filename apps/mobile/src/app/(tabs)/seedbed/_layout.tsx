import { Stack } from 'expo-router';

import { useTheme } from '../../../ui/theme/theme-provider';

/** A link straight to a pushed screen still has the tab's first screen under it to go back to. */
export const unstable_settings = { initialRouteName: 'index' };

export default function TabStack() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}
    />
  );
}
