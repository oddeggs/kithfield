import { FarmId } from '@kithfield/contracts';
import { useLocalSearchParams } from 'expo-router';

import { FireRoomScreen } from '../../features/fire/fire-room';

/** A farm's fire room, full screen over the app: `/fire-room?farm=<id>`. */
export default function FireRoomRoute() {
  const { farm } = useLocalSearchParams<{ farm?: string }>();
  const parsed = FarmId.safeParse(farm);
  if (!parsed.success) return null;
  return <FireRoomScreen farm={parsed.data} />;
}
