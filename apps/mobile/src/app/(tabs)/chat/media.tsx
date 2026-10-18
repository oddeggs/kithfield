import { useLocalSearchParams } from 'expo-router';

import { MediaScreen } from '../../../features/chat/media/media-screen';

/** Shared on the farm. */
export default function ChatMediaRoute() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return <MediaScreen farm={farm} />;
}
