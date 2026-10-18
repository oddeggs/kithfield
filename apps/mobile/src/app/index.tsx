import { Redirect } from 'expo-router';

/** The app opens on the farm. */
export default function Index() {
  return <Redirect href="/farm" />;
}
