import { useLocalSearchParams } from 'expo-router';

import { PickerScreen } from '../../features/stickers/picker/picker-screen';

/** The sticker picker over a farm's chat: `farm`. */
export default function StickersPickerRoute() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return <PickerScreen farm={farm} />;
}
