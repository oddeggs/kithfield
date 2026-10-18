import { QuickTendScreen } from '../../features/gestures/quick-tend';
import { Presentation } from '../../features/gestures/ui/presentation';

/** Quick Tend, across every farm and visit. */
export default function QuickTendScreenRoute() {
  return (
    <>
      <Presentation as="cover" />
      <QuickTendScreen />
    </>
  );
}
