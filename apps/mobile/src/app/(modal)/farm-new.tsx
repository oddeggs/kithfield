import { Stack } from 'expo-router';

import { NewFarm } from '../../features/farm/new-farm';
import { useTheme } from '../../ui/theme/theme-provider';

/** Plant a new farm, over the valley. */
export default function FarmNew() {
  const { palette } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.82, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 30,
          contentStyle: { backgroundColor: palette.sheet },
        }}
      />
      <NewFarm />
    </>
  );
}
