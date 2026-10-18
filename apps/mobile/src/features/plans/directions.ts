import type { Place } from '@kithfield/contracts';
import * as Location from 'expo-location';
import { Linking } from 'react-native';

const MAPS = 'https://maps.apple.com/';

/** Apple Maps directions to a place: by its coordinates when it has them, else by its words. */
export function directionsUrl(place: Place, from?: { lat: number; lng: number }): string {
  const to =
    place.lat !== undefined && place.lng !== undefined
      ? `${place.lat},${place.lng}`
      : [place.name, place.address].filter(Boolean).join(', ');
  const query = new URLSearchParams({ daddr: to, dirflg: 'd' });
  if (from) query.set('saddr', `${from.lat},${from.lng}`);
  return `${MAPS}?${query.toString()}`;
}

/**
 * Directions only when asked: location "while using the app" is asked for then, and only to start
 * the route from here. Without it, Maps starts from wherever it thinks the person is.
 */
export async function openDirections(place: Place): Promise<void> {
  let from: { lat: number; lng: number } | undefined;
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (granted) {
      const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      from = { lat: here.coords.latitude, lng: here.coords.longitude };
    }
  } catch {
    // No position: Maps finds its own.
  }
  await Linking.openURL(directionsUrl(place, from));
}
