import type { Place } from '@kithfield/contracts';
import { Linking } from 'react-native';

const MAPS = 'https://maps.apple.com/';

/**
 * Apple Maps directions to a place: by its coordinates when it has them, else by its words. Maps
 * starts the route from wherever it finds the person; Kithfield never asks where they are.
 */
export function directionsUrl(place: Place): string {
  const to =
    place.lat !== undefined && place.lng !== undefined
      ? `${place.lat},${place.lng}`
      : [place.name, place.address].filter(Boolean).join(', ');
  const query = new URLSearchParams({ daddr: to, dirflg: 'd' });
  return `${MAPS}?${query.toString()}`;
}

/** Opens Apple Maps with the way to the place. */
export async function openDirections(place: Place): Promise<void> {
  await Linking.openURL(directionsUrl(place));
}
