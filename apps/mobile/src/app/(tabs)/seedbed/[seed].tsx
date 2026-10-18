import { useLocalSearchParams } from 'expo-router';

import { oneParam, seqParam } from '../../../features/plans/params';
import { PlanScreen } from '../../../features/plans/plan-screen';

/** A plan: voting buds and the sun patch, or where it stands. */
export default function PlanRoute() {
  const params = useLocalSearchParams<{ farm?: string; seed?: string }>();
  const farm = oneParam(params.farm);
  const seq = seqParam(params.seed);
  if (farm === null || seq === null) return null;
  return <PlanScreen farm={farm} seq={seq} />;
}
