import { useLocalSearchParams } from 'expo-router';

import { ShopScreen } from '../../features/stickers/shop/shop-screen';

/** The sticker shop; `farm` is where a gift would leave from. */
export default function StickersShopRoute() {
  const { farm } = useLocalSearchParams<{ farm?: string }>();
  return <ShopScreen farm={typeof farm === 'string' && farm !== '' ? farm : null} />;
}
