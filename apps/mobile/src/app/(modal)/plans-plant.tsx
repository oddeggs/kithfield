import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { oneParam, seqParam } from '../../features/plans/params';
import { PlantSheet } from '../../features/plans/plant-sheet';
import { useBedFarms } from '../../features/plans/use-seed-bed';

/** Planting a plan, from a message (`fromSeq`) or from the seed bed. */
export default function PlansPlantRoute() {
  const params = useLocalSearchParams<{ farm?: string; fromSeq?: string }>();
  const farms = useBedFarms();
  const [chosen, setChosen] = useState<string | null>(null);
  const farm = chosen ?? oneParam(params.farm) ?? farms?.[0]?.farm ?? null;
  if (farm === null) return null;
  return (
    <PlantSheet
      farm={farm}
      fromSeq={seqParam(params.fromSeq)}
      farms={farms ?? []}
      onFarm={setChosen}
    />
  );
}
