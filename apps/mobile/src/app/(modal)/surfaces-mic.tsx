import { AskSheet } from '../../features/surfaces/ask-sheet';

/** Before you sit down: the farm asks for the mic, then iOS does. */
export default function SurfacesMic() {
  return <AskSheet device="mic" />;
}
