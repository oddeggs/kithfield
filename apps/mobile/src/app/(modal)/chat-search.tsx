import { Stack, useLocalSearchParams } from 'expo-router';

import { SearchScreen } from '../../features/chat/search/search-screen';

/** Search a farm's chat, or every farm: a full screen over the app, not a sheet. */
export default function ChatSearchRoute() {
  const { farm } = useLocalSearchParams<{ farm?: string }>();
  return (
    <>
      <Stack.Screen options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <SearchScreen farm={typeof farm === 'string' && farm !== '' ? farm : null} />
    </>
  );
}
