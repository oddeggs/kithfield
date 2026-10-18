import { useLocalSearchParams } from 'expo-router';

import { BubbleEditor } from '../../../features/farm/bubble-editor';

/** Your status bubble (04-23): `farm`. */
export default function Bubble() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <BubbleEditor farm={farm} /> : null;
}
