import { FireflyScreen } from '../../features/gestures/firefly';
import { Presentation } from '../../features/gestures/ui/presentation';

/** Leave a firefly on a doorstep: `farm`, and `to` to pick the door. */
export default function FireflyScreenRoute() {
  return (
    <>
      <Presentation as="cover" />
      <FireflyScreen />
    </>
  );
}
