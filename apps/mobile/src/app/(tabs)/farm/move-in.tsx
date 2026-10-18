import { useLocalSearchParams } from 'expo-router';

import { MoveIn } from '../../../features/farm/moment-screens';

/** Move-in day (04-19): `farm` and the `person` who moved in. */
export default function MoveInDay() {
  const { farm, person } = useLocalSearchParams<{ farm: string; person: string }>();
  return farm && person ? <MoveIn farm={farm} person={person} /> : null;
}
