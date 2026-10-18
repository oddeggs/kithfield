import { Redirect } from 'expo-router';

import { useSession } from '../ui/session/session';

/** The app opens on the farm, or on the way in for someone not signed in yet. */
export default function Index() {
  const { status } = useSession();
  return <Redirect href={status === 'signedIn' ? '/farm' : '/welcome'} />;
}
