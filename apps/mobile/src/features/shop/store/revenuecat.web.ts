import { noStore, type Store } from './store';

/**
 * The browser and the desktop app sell nothing: digital items are bought in the phone's store
 * (App Store, Play), so here the shop shows what's owned and points to the app.
 */
export function revenueCatStore(_person: string): Store {
  return noStore;
}
