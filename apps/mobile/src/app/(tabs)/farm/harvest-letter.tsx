import { useLocalSearchParams } from 'expo-router';

import { RecapScreen } from '../../../features/rhythm/recap-screen';

/** The Sunday harvest letter: `farm`, and the week by its Sunday (`week`), else the latest. */
export default function HarvestLetter() {
  const { farm, week } = useLocalSearchParams<{ farm: string; week?: string }>();
  return farm ? <RecapScreen farm={farm} {...(week ? { week } : {})} /> : null;
}
