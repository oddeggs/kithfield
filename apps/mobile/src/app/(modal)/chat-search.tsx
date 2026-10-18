import { useLocalSearchParams } from 'expo-router';

import { SearchScreen } from '../../features/chat/search/search-screen';

/** Search a farm's chat, or every farm (04-11). */
export default function ChatSearchRoute() {
  const { farm } = useLocalSearchParams<{ farm?: string }>();
  return <SearchScreen farm={typeof farm === 'string' && farm !== '' ? farm : null} />;
}
