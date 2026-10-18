import { Redirect } from 'expo-router';

import { useSession } from '../ui/session/session';

/** The app opens on the farm, or on the way in for someone not through it yet. */
export default function Index() {
  const { status, onboarded } = useSession();
  return <Redirect href={status === 'signedIn' && onboarded ? '/farm' : '/welcome'} />;
}
