import { ForwardScreen } from '../../features/gestures/forward';
import { Presentation } from '../../features/gestures/ui/presentation';

/** Forwarding a message: `farm`, `seq`. */
export default function ForwardScreenRoute() {
  return (
    <>
      <Presentation as="cover" />
      <ForwardScreen />
    </>
  );
}
