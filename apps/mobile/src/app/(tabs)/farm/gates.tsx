import { useLocalSearchParams } from 'expo-router';

import { GatesScreen } from '../../../features/rhythm/gates-screen';

/** Friends' farms to visit, from your farm `from`; `person` narrows to one friend's. */
export default function Gates() {
  const { from, person } = useLocalSearchParams<{ from: string; person?: string }>();
  return from ? <GatesScreen from={from} {...(person ? { person } : {})} /> : null;
}
