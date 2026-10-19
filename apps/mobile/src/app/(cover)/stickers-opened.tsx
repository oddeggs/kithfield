import { useLocalSearchParams } from 'expo-router';

import { OpenedScreen } from '../../features/stickers/gift/opened-screen';

/** A gifted pack opening: the `gift {given}` event at `seq` on `farm`. */
export default function StickersOpenedRoute() {
  const { farm, seq } = useLocalSearchParams<{ farm: string; seq: string }>();
  return <OpenedScreen farm={farm} seq={Number(seq)} />;
}
