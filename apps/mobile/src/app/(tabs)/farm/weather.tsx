import { useLocalSearchParams } from 'expo-router';

import { WeatherScreen } from '../../../features/rhythm/weather-screen';

/** Today's real weather on the farm, with its attribution: `farm`. */
export default function Weather() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <WeatherScreen farm={farm} /> : null;
}
