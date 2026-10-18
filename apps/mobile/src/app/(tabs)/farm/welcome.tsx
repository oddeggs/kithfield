import { useLocalSearchParams } from 'expo-router';

import { WelcomeBack } from '../../../features/farm/moment-screens';

/** Welcome back after a week or more away (04-16): `farm`. */
export default function Welcome() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <WelcomeBack farm={farm} /> : null;
}
