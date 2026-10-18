import { Stack } from 'expo-router';

import { useTheme } from '../../../ui/theme/theme-provider';

export default function TabStack() {
  const { palette } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}
    />
  );
}
