import { TimeZone } from '@kithfield/contracts';
import { useCalendars } from 'expo-localization';

/** This phone's time zone, as the contracts take it; UTC when the phone names none it knows. */
export function usePhoneZone(): string {
  const zone = useCalendars()[0]?.timeZone ?? 'UTC';
  return TimeZone.safeParse(zone).success ? zone : 'UTC';
}
