import { RareVariant } from '@kithfield/contracts';
import { useLocalSearchParams } from 'expo-router';

import { PlantScreen } from '../../../features/field-guide/plant-screen';
import { oneParam } from '../../../features/field-guide/routes';

/** A plant's page in the field guide: `farm`, `plant`, and a rare `variant` to show. */
export default function FieldGuidePlant() {
  const params = useLocalSearchParams<{ farm?: string; plant?: string; variant?: string }>();
  const farm = oneParam(params.farm);
  const plant = oneParam(params.plant);
  const variant = RareVariant.safeParse(oneParam(params.variant));
  if (!farm || !plant) return null;
  return <PlantScreen farm={farm} plant={plant} variant={variant.success ? variant.data : null} />;
}
