import { Stack } from 'expo-router';

import { ShopProvider } from '../../../features/shop/data/shop-data';
import { useTheme } from '../../../ui/theme/theme-provider';

/** A link straight to a shop screen still has Rocco's cart under it to go back to. */
export const unstable_settings = { anchor: 'index' };

/**
 * The shop: a cover over the app with its own stack, so its screens push and swipe back as the
 * design draws them (a back chevron on each), and the shop's data is loaded once for all of them.
 */
export default function ShopStack() {
  const { palette } = useTheme();
  return (
    <ShopProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
        }}
      />
    </ShopProvider>
  );
}
