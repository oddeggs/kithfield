import { useLocalSearchParams } from 'expo-router';

import { Hangout } from '../../features/plans/hangout';
import { oneParam, seqParam } from '../../features/plans/params';

/** The day of a plan, at the campfire. */
export default function PlansHangoutRoute() {
  const params = useLocalSearchParams<{ farm?: string; seed?: string }>();
  const farm = oneParam(params.farm);
  const seq = seqParam(params.seed);
  if (farm === null || seq === null) return null;
  return <Hangout farm={farm} seq={seq} />;
}
