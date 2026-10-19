import { useLocalSearchParams } from 'expo-router';

import { ScrapbookScreen } from '../../../features/rhythm/scrapbook-screen';

/** The farm's scrapbook: `farm`. */
export default function Scrapbook() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <ScrapbookScreen farm={farm} /> : null;
}
