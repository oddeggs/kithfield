import { Stack, useLocalSearchParams } from 'expo-router';

import { CritterCard } from '../../features/farm/critter-card';
import { useTheme } from '../../ui/theme/theme-provider';

/** A critter's card over the farm: `farm` and `person`. */
export default function FarmCritter() {
  const { palette } = useTheme();
  const { farm, person } = useLocalSearchParams<{ farm: string; person: string }>();
  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.67, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 30,
          contentStyle: { backgroundColor: palette.sheet },
        }}
      />
      {farm && person ? <CritterCard farm={farm} person={person} /> : null}
    </>
  );
}
