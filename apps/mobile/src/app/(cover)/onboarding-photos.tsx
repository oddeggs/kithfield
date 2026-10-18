import { useRouter } from 'expo-router';

import { PhotosAsk } from '../../features/onboarding/screens/ask-screens';

/**
 * Asking for photos the first time someone attaches one, in the farm's voice. It closes when
 * answered; the screen that opened it then shows the photo picker.
 */
export default function OnboardingPhotos() {
  const router = useRouter();
  return <PhotosAsk onDone={() => router.back()} />;
}
