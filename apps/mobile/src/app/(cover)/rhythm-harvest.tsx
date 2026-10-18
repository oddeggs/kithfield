import { useLocalSearchParams } from 'expo-router';

import { HarvestScreen } from '../../features/field-guide/harvest-screen';
import { oneParam } from '../../features/field-guide/routes';

/** Harvest day's basket: `farm`. */
export default function RhythmHarvest() {
  const params = useLocalSearchParams<{ farm?: string }>();
  const farm = oneParam(params.farm);
  return farm ? <HarvestScreen farm={farm} /> : null;
}
