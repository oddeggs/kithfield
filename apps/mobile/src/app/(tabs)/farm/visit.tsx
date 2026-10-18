import { useLocalSearchParams } from 'expo-router';

import { VisitScreen } from '../../../features/rhythm/visit-screen';

/** At a friend's farm's gate: `farm`, from your farm `from`, met by `friend`. */
export default function Visit() {
  const { farm, from, friend } = useLocalSearchParams<{
    farm: string;
    from: string;
    friend: string;
  }>();
  return farm && from && friend ? <VisitScreen farm={farm} from={from} friend={friend} /> : null;
}
