import { useLocalSearchParams } from 'expo-router';

import { GuideScreen } from '../../../features/field-guide/guide-screen';
import { oneParam } from '../../../features/field-guide/routes';

/** The farm's field guide: `farm`. */
export default function FieldGuide() {
  const params = useLocalSearchParams<{ farm?: string }>();
  const farm = oneParam(params.farm);
  return farm ? <GuideScreen farm={farm} /> : null;
}
