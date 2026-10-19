import { useLocalSearchParams } from 'expo-router';

import { RainScreen } from '../../features/rhythm/rain-screen';

/** Shared rain on the farm: `farm`. */
export default function RhythmRain() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <RainScreen farm={farm} /> : null;
}
