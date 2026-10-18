import { useLocalSearchParams } from 'expo-router';

import { PlantsScreen } from '../../../features/field-guide/plants-screen';
import { oneParam } from '../../../features/field-guide/routes';

/** Every plant at every stage: `farm`. */
export default function FieldGuidePlants() {
  const params = useLocalSearchParams<{ farm?: string }>();
  const farm = oneParam(params.farm);
  return farm ? <PlantsScreen farm={farm} /> : null;
}
