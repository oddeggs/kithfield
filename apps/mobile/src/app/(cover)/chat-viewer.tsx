import { useLocalSearchParams } from 'expo-router';

import { ViewerScreen } from '../../features/chat/viewer/viewer-screen';

/** The photo and video viewer. */
export default function ChatViewerRoute() {
  const params = useLocalSearchParams<{ farm: string; seq: string; index?: string }>();
  return (
    <ViewerScreen farm={params.farm} seq={Number(params.seq)} index={Number(params.index ?? 0)} />
  );
}
