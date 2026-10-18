import { useLocalSearchParams } from 'expo-router';

import { SleepingCottage } from '../../../features/farm/farm-pages';

/** A cottage left behind (04-22): `farm` and `person`. */
export default function Cottage() {
  const { farm, person } = useLocalSearchParams<{ farm: string; person: string }>();
  return farm && person ? <SleepingCottage farm={farm} person={person} /> : null;
}
