import { useSyncExternalStore } from 'react';

/*
 * The chat open beside farms and visits on a large screen. It outlives the window's layout, so a
 * window narrowed to the phone layout can open the same chat, and widened again shows it still.
 */

let open: string | null = null;
const listeners = new Set<() => void>();

export function setOpenChat(farm: string | null): void {
  if (open === farm) return;
  open = farm;
  for (const l of listeners) l();
}

export function openChat(): string | null {
  return open;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The chat open beside farms and visits, if one has been chosen. */
export function useOpenChat(): string | null {
  return useSyncExternalStore(subscribe, openChat);
}
