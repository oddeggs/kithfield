import { useLocalSearchParams } from 'expo-router';

import { ScrapbookScreen } from '../../../features/field-guide/scrapbook-screen';
import { oneParam } from '../../../features/field-guide/routes';

/** A visit's little scrapbook of pressed blooms: `farm` is the visit. */
export default function PorchScrapbook() {
  const params = useLocalSearchParams<{ farm?: string }>();
  const farm = oneParam(params.farm);
  return farm ? <ScrapbookScreen visit={farm} /> : null;
}
