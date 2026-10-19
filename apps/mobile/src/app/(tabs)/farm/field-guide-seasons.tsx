import { useLocalSearchParams } from 'expo-router';

import { SeasonsScreen } from '../../../features/field-guide/seasons-screen';
import { oneParam } from '../../../features/field-guide/routes';

/** The farm in each of its four seasons: `farm`. */
export default function FieldGuideSeasons() {
  const params = useLocalSearchParams<{ farm?: string }>();
  const farm = oneParam(params.farm);
  return farm ? <SeasonsScreen farm={farm} /> : null;
}
