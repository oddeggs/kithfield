import { router, type Href } from 'expo-router';

/**
 * Opens a route another feature owns. Its file may not exist on this branch yet (Expo Router then
 * shows not-found), so the path isn't checked against this branch's typed routes.
 */
export function go(path: string, params?: Record<string, string>): void {
  router.push((params ? { pathname: path, params } : path) as Href);
}

/** Swaps the screen shown for another route (a sheet that leads on to another sheet). */
export function swap(path: string, params?: Record<string, string>): void {
  router.replace((params ? { pathname: path, params } : path) as Href);
}
