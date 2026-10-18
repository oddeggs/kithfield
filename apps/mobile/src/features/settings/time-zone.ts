import { TimeZone, type MeSettings } from '@kithfield/contracts';
import { useCalendars } from 'expo-localization';
import { useEffect, useRef } from 'react';

import { useSettingsApi } from './api/use-api';

/** This phone's time zone, as the contracts take it; UTC when the phone names none it knows. */
export function usePhoneZone(): string {
  const zone = useCalendars()[0]?.timeZone ?? 'UTC';
  return TimeZone.safeParse(zone).success ? zone : 'UTC';
}

/**
 * Tells the server this phone's time zone, with the quiet hours, whenever it differs from the
 * person's settings: quiet hours, the house floor and slow posts all run in it.
 */
export function useTimeZoneSync(settings: MeSettings | null): void {
  const api = useSettingsApi();
  const zone = usePhoneZone();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (settings === null || settings.timeZone === zone || sent.current === zone) return;
    sent.current = zone;
    api.updateSettings({ timeZone: zone, quietHours: settings.quietHours }).catch(() => {
      sent.current = null;
    });
  }, [api, settings, zone]);
}
