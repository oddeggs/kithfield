import { useLocalSearchParams } from 'expo-router';

import { RareBloomScreen } from '../../features/field-guide/rare-bloom-screen';
import { oneParam } from '../../features/field-guide/routes';

/** A rare bloom, shown once: `farm` and the bloom's `key`. */
export default function RhythmRareBloom() {
  const params = useLocalSearchParams<{ farm?: string; key?: string }>();
  const farm = oneParam(params.farm);
  const key = oneParam(params.key);
  return farm && key ? <RareBloomScreen farm={farm} bloomKey={key} /> : null;
}
