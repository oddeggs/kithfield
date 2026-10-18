import { router, type Href } from 'expo-router';

/** Opens a screen, this feature's or another's, by its typed route. */
export function go(to: Href): void {
  router.push(to);
}

/** Swaps the screen shown for another route (a sheet that leads on to another sheet). */
export function swap(to: Href): void {
  router.replace(to);
}
