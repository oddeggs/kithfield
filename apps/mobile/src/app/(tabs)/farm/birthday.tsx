import { useLocalSearchParams } from 'expo-router';

import { BirthdayScreen } from '../../../features/rhythm/birthday-screen';

/** A friend's birthday bloom: `farm`, `person`. */
export default function Birthday() {
  const { farm, person } = useLocalSearchParams<{ farm: string; person: string }>();
  return farm && person ? <BirthdayScreen farm={farm} person={person} /> : null;
}
