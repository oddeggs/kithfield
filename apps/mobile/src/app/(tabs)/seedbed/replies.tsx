import { useLocalSearchParams } from 'expo-router';

import { oneParam, seqParam } from '../../../features/plans/params';
import { RepliesScreen } from '../../../features/plans/replies-screen';

/** A plan's replies and the organiser's hat. */
export default function RepliesRoute() {
  const params = useLocalSearchParams<{ farm?: string; seed?: string }>();
  const farm = oneParam(params.farm);
  const seq = seqParam(params.seed);
  if (farm === null || seq === null) return null;
  return <RepliesScreen farm={farm} seq={seq} />;
}
