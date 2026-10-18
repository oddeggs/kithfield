/**
 * How a root route is presented, by the group its file sits in, so a feature adds a modal or a
 * full-screen cover by placing a file, never by editing the root layout:
 *
 * - `app/(modal)/<feature>-<screen>.tsx`: a card sheet over the app (iOS page sheet).
 * - `app/(cover)/<feature>-<screen>.tsx`: full screen over everything (the photo viewer, the fire).
 */
export type Presentation = 'card' | 'modal' | 'fullScreenModal';

export function presentationFor(routeName: string): Presentation {
  if (routeName.startsWith('(modal)/')) return 'modal';
  if (routeName.startsWith('(cover)/')) return 'fullScreenModal';
  return 'card';
}
