import { AttachScreen } from '../../features/gestures/attach-sheet';
import { Presentation } from '../../features/gestures/ui/presentation';

/** Attach photos, files or a link to a farm: `farm`. */
export default function AttachScreenRoute() {
  return (
    <>
      <Presentation as="overlay" />
      <AttachScreen />
    </>
  );
}
