import { SlowPostScreen } from '../../features/gestures/slow-post';
import { Presentation } from '../../features/gestures/ui/presentation';

/** Slow post to a friend: `farm`, `to`. */
export default function SlowPostScreenRoute() {
  return (
    <>
      <Presentation as="cover" />
      <SlowPostScreen />
    </>
  );
}
