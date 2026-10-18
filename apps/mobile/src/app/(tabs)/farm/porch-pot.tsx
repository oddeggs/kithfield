import { useLocalSearchParams } from 'expo-router';

import { PorchPotScreen } from '../../../features/field-guide/porch-pot-screen';
import { oneParam } from '../../../features/field-guide/routes';

/** A visit's porch pot: `farm` is the visit. */
export default function PorchPot() {
  const params = useLocalSearchParams<{ farm?: string }>();
  const farm = oneParam(params.farm);
  return farm ? <PorchPotScreen visit={farm} /> : null;
}
