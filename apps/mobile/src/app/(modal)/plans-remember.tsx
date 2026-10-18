import { Stack, useLocalSearchParams } from 'expo-router';

import { oneParam, seqParam } from '../../features/plans/params';
import { REMEMBER_SHEET, RememberSheet } from '../../features/plans/remember-sheet';

/** A remember-me seed from a friend's message, as a sheet over the chat it came from. */
export default function PlansRememberRoute() {
  const params = useLocalSearchParams<{ farm?: string; seq?: string; about?: string }>();
  const farm = oneParam(params.farm);
  const seq = seqParam(params.seq);
  const about = oneParam(params.about);
  return (
    <>
      <Stack.Screen options={REMEMBER_SHEET} />
      {farm === null || seq === null || about === null ? null : (
        <RememberSheet farm={farm} seq={seq} about={about} />
      )}
    </>
  );
}
