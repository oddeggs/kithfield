import { useLocalSearchParams } from 'expo-router';

import { RemovedFromFarm } from '../../../features/farm/farm-pages';

/** Taken off a farm, shown once: `farm`, and `by` (`keeper` or `neutral`). */
export default function Removed() {
  const { farm, by } = useLocalSearchParams<{ farm: string; by?: string }>();
  return farm ? <RemovedFromFarm farm={farm} by={by === 'keeper' ? 'keeper' : 'neutral'} /> : null;
}
