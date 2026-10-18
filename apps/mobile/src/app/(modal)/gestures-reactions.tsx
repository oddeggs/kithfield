import { ReactionsScreen } from '../../features/gestures/reactions';
import { Presentation } from '../../features/gestures/ui/presentation';

/** Every warm reaction, reacting on a message: `farm`, `seq`. */
export default function ReactionsScreenRoute() {
  return (
    <>
      <Presentation as="overlay" />
      <ReactionsScreen />
    </>
  );
}
