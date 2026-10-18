import { stickerColours, type StickerColours } from '@kithfield/theme';

import { useTheme } from '../../../ui/theme/theme-provider';

/** The sticker screens' colours (`@kithfield/theme`), in the appearance the app is in. */
export function useStickerColours(): StickerColours {
  return stickerColours[useTheme().palette.appearance];
}
