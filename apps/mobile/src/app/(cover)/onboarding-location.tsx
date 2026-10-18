import { useRouter } from 'expo-router';

import { LocationAsk } from '../../features/onboarding/screens/ask-screens';

/**
 * Asking for location on a hangout day, in the farm's voice, only when someone wants the way
 * shown. It closes when answered.
 */
export default function OnboardingLocation() {
  const router = useRouter();
  return <LocationAsk onDone={() => router.back()} />;
}
