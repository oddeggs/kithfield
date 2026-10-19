import { router } from 'expo-router';
import { createContext, useContext } from 'react';

/** The desktop's shared state: the farm the panes are on, and the right pane's mode. */
export interface Desk {
  readonly wide: boolean;
  /** The farm or visit the chat and the live farm show, or null before there is one. */
  readonly farm: string | null;
  /** Sitting by the fire: the right pane shows the fire room instead of the farm. */
  readonly fire: boolean;
  readonly setFire: (on: boolean) => void;
}

export const DeskContext = createContext<Desk>({
  wide: false,
  farm: null,
  fire: false,
  setFire: () => undefined,
});

export const useDesk = (): Desk => useContext(DeskContext);

/** Opens a farm's chat in the middle pane. */
export const openChat = (farm: string) =>
  router.navigate({ pathname: '/(tabs)/chat/[farm]', params: { farm } });
