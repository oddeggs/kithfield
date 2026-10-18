import { shopInks, type ShopInks } from '@kithfield/theme';

import { useTheme } from '../../../ui/theme/theme-provider';

export type { ShopInks };

/** The shop's inks (`@kithfield/theme`'s `shopInks`) in the appearance shown now. */
export function useInks(): ShopInks {
  const { appearance } = useTheme();
  return shopInks[appearance];
}
