import type { FarmId, PersonId } from '@kithfield/contracts';
import { router, type Href } from 'expo-router';

/* Where the farm screens lead, its own and other features' screens, by each route's typed path. */

export const farmRoutes = {
  home: (): Href => '/(tabs)/farm',
  valley: (): Href => '/(tabs)/farm/valley',
  critters: (farm: FarmId): Href => ({ pathname: '/(tabs)/farm/critters', params: { farm } }),
  bubble: (farm: FarmId): Href => ({ pathname: '/(tabs)/farm/bubble', params: { farm } }),
  cottage: (farm: FarmId, person: PersonId): Href => ({
    pathname: '/(tabs)/farm/cottage',
    params: { farm, person },
  }),
  moveIn: (farm: FarmId, person: PersonId): Href => ({
    pathname: '/(tabs)/farm/move-in',
    params: { farm, person },
  }),
  welcome: (farm: FarmId): Href => ({ pathname: '/(tabs)/farm/welcome', params: { farm } }),
  removed: (farm: FarmId, by: 'keeper' | 'neutral'): Href => ({
    pathname: '/(tabs)/farm/removed',
    params: { farm, by },
  }),
  leave: (farm: FarmId): Href => ({ pathname: '/(tabs)/farm/leave', params: { farm } }),
  critter: (farm: FarmId, person: PersonId): Href => ({
    pathname: '/(modal)/farm-critter',
    params: { farm, person },
  }),
  newFarm: (): Href => '/(modal)/farm-new',

  /* Other features' screens */
  chat: (farm: FarmId): Href => ({ pathname: '/(tabs)/chat/[farm]', params: { farm } }),
  media: (farm: FarmId): Href => ({ pathname: '/(tabs)/chat/media', params: { farm } }),
  seedbed: (): Href => '/(tabs)/seedbed',
  plan: (farm: FarmId, seed: number): Href => ({
    pathname: '/(tabs)/seedbed/[seed]',
    params: { farm, seed: String(seed) },
  }),
  tray: (farm: FarmId, to?: PersonId): Href => ({
    pathname: '/(modal)/gestures-tray',
    params: to ? { farm, to } : { farm },
  }),
  report: (farm: FarmId, person: PersonId): Href => ({
    pathname: '/(modal)/safety-report',
    params: { farm, person },
  }),
  block: (person: PersonId): Href => ({ pathname: '/(modal)/safety-block', params: { person } }),
  farmSettings: (farm: FarmId): Href => ({
    pathname: '/(tabs)/you/farm-settings',
    params: { farm },
  }),
} as const;

/** Closes whatever the farm screens opened (a sheet, a moment, the valley) and shows the farm. */
export function backToFarm(): void {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(farmRoutes.home());
}
