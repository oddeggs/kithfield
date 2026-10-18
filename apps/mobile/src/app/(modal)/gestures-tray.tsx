import { TrayScreen } from '../../features/gestures/tray';
import { Presentation } from '../../features/gestures/ui/presentation';

/** The + tray over a farm or visit: `farm`, and `to` for a gesture to one friend. */
export default function TrayScreenRoute() {
  return (
    <>
      <Presentation as="overlay" />
      <TrayScreen />
    </>
  );
}
