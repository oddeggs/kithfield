import { HeavyWeatherScreen } from '../../features/gestures/heavy-weather';
import { Presentation } from '../../features/gestures/ui/presentation';

/** A friend's rain cloud: `farm`, `to`. */
export default function HeavyWeatherScreenRoute() {
  return (
    <>
      <Presentation as="cover" />
      <HeavyWeatherScreen />
    </>
  );
}
