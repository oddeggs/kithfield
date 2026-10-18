import { useLocalSearchParams } from 'expo-router';

import { RemovedFromFarm } from '../../../features/farm/farm-pages';

/** Taken off a farm, shown once: `farm`. */
export default function Removed() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <RemovedFromFarm farm={farm} /> : null;
}
