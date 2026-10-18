import { chatInks, type ChatInks } from '@kithfield/theme';

import { useTheme } from '../../../ui/theme/theme-provider';

export type ChatColours = ChatInks;

/** The chat's inks in the current appearance (`@kithfield/theme`'s `chatInks`). */
export function useChatColours(): ChatColours {
  return chatInks[useTheme().appearance];
}
