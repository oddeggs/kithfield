import type { FarmId, PersonId } from '@kithfield/contracts';
import { router, type Href } from 'expo-router';

/*
 * Where the farm screens lead. Routes other features own are linked by path and params as the
 * shared route table names them; until those screens land, a link shows the not-found screen.
 */

const q = (params: Record<string, string | number>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

const href = (path: string, params?: Record<string, string | number>): Href =>
  (params ? `${path}?${q(params)}` : path) as Href;

export const farmRoutes = {
  home: () => href('/farm'),
  valley: () => href('/farm/valley'),
  critters: (farm: FarmId) => href('/farm/critters', { farm }),
  bubble: (farm: FarmId) => href('/farm/bubble', { farm }),
  cottage: (farm: FarmId, person: PersonId) => href('/farm/cottage', { farm, person }),
  moveIn: (farm: FarmId, person: PersonId) => href('/farm/move-in', { farm, person }),
  welcome: (farm: FarmId) => href('/farm/welcome', { farm }),
  removed: (farm: FarmId) => href('/farm/removed', { farm }),
  leave: (farm: FarmId) => href('/farm/leave', { farm }),
  critter: (farm: FarmId, person: PersonId) => href('/farm-critter', { farm, person }),
  newFarm: () => href('/farm-new'),

  /* Other features' screens */
  chat: (farm: FarmId) => href(`/chat/${encodeURIComponent(farm)}`),
  media: (farm: FarmId) => href('/chat/media', { farm }),
  seedbed: () => href('/seedbed'),
  plan: (farm: FarmId, seed: number) => href(`/seedbed/${seed}`, { farm, seed }),
  tray: (farm: FarmId, to?: PersonId) => href('/gestures-tray', to ? { farm, to } : { farm }),
  report: (farm: FarmId, person: PersonId) => href('/safety-report', { farm, person }),
  block: (person: PersonId) => href('/safety-block', { person }),
  farmSettings: (farm: FarmId) => href('/you/farm-settings', { farm }),
} as const;

/** Closes whatever the farm screens opened (a sheet, a moment, the valley) and shows the farm. */
export function backToFarm(): void {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(farmRoutes.home());
}
