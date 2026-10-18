import { useLocalSearchParams } from 'expo-router';

import { CrittersScreen } from '../../../features/farm/critters-screen';

/** Who lives here: `farm`. */
export default function Critters() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <CrittersScreen farm={farm} /> : null;
}
