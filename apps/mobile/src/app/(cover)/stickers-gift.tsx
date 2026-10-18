import { useLocalSearchParams } from 'expo-router';

import { GiftScreen } from '../../features/stickers/gift/gift-screen';

/** Gift a pack: `pack`, and optionally the `farm` and friend (`to`) it goes to. */
export default function StickersGiftRoute() {
  const { pack, farm, to } = useLocalSearchParams<{ pack: string; farm?: string; to?: string }>();
  return (
    <GiftScreen
      pack={pack}
      farm={typeof farm === 'string' && farm !== '' ? farm : null}
      to={typeof to === 'string' && to !== '' ? to : null}
    />
  );
}
