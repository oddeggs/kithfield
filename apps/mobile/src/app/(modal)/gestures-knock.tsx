import { KnockScreen } from '../../features/gestures/knock';
import { Presentation } from '../../features/gestures/ui/presentation';

/** Knock on a friend's window: `farm`, `to`. */
export default function KnockScreenRoute() {
  return (
    <>
      <Presentation as="cover" />
      <KnockScreen />
    </>
  );
}
