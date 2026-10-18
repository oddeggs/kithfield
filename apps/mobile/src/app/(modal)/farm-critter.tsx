import { useLocalSearchParams } from 'expo-router';

import { CritterCard } from '../../features/farm/critter-card';

/** A critter's card over the farm: `farm` and `person`. */
export default function FarmCritter() {
  const { farm, person } = useLocalSearchParams<{ farm: string; person: string }>();
  return farm && person ? <CritterCard farm={farm} person={person} /> : null;
}
