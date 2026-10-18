import { useLocalSearchParams } from 'expo-router';

import { LeaveFarm } from '../../../features/farm/farm-pages';

/** Leaving a farm quietly: `farm`. */
export default function Leave() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <LeaveFarm farm={farm} /> : null;
}
