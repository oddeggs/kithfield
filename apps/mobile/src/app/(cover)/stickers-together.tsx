import { useLocalSearchParams } from 'expo-router';

import { TogetherScreen } from '../../features/stickers/together/together-screen';

/** Together stickers on a farm: `farm`, and `ask` to take one out of Kithfield. */
export default function StickersTogetherRoute() {
  const { farm, ask } = useLocalSearchParams<{ farm: string; ask?: string }>();
  return <TogetherScreen farm={farm} ask={ask === '1'} />;
}
