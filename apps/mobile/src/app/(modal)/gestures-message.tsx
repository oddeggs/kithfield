import { MessageMenu } from '../../features/gestures/menu/message-menu';
import { Presentation } from '../../features/gestures/ui/presentation';

/** The long-press menu on a message: `farm`, `seq`, and `top` (the bubble's top on screen). */
export default function MessageMenuRoute() {
  return (
    <>
      <Presentation as="overlay" />
      <MessageMenu />
    </>
  );
}
