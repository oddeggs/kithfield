import { AskSheet } from '../../features/surfaces/ask-sheet';

/** Lighting your lantern: the farm asks for the camera, then iOS does. */
export default function SurfacesCamera() {
  return <AskSheet device="camera" />;
}
