import type { FarmId, LocalDate, PersonId } from '@kithfield/contracts';
import type { Href } from 'expo-router';

/* Where the rhythm screens are, and where they lead, by each route's typed path. */

export const rhythmRoutes = {
  birthday: (farm: FarmId, person: PersonId): Href => ({
    pathname: '/(tabs)/farm/birthday',
    params: { farm, person },
  }),
  recap: (farm: FarmId, week?: LocalDate): Href => ({
    pathname: '/(tabs)/farm/harvest-letter',
    params: week ? { farm, week } : { farm },
  }),
  rain: (farm: FarmId): Href => ({ pathname: '/(cover)/rhythm-rain', params: { farm } }),
  project: (farm: FarmId): Href => ({ pathname: '/(tabs)/farm/project', params: { farm } }),
  weather: (farm: FarmId): Href => ({ pathname: '/(tabs)/farm/weather', params: { farm } }),
  scrapbook: (farm: FarmId): Href => ({ pathname: '/(tabs)/farm/scrapbook', params: { farm } }),
  /** Friends' farms to visit, seen from `from`; `person` narrows to one friend's. */
  gates: (from: FarmId, person?: PersonId): Href => ({
    pathname: '/(tabs)/farm/gates',
    params: person ? { from, person } : { from },
  }),
  /** At `farm`'s gate, from your farm `from`, met by `friend`. */
  visit: (farm: FarmId, from: FarmId, friend: PersonId): Href => ({
    pathname: '/(tabs)/farm/visit',
    params: { farm, from, friend },
  }),
  trade: (farm: FarmId, from: FarmId, friend: PersonId): Href => ({
    pathname: '/(tabs)/farm/trade',
    params: { farm, from, friend },
  }),

  /* Other features' screens */
  plant: (farm: FarmId): Href => ({ pathname: '/(modal)/plans-plant', params: { farm } }),
  attach: (farm: FarmId): Href => ({ pathname: '/(modal)/gestures-attach', params: { farm } }),
  aiConsent: (): Href => '/(tabs)/you/ai',
  chat: (farm: FarmId): Href => ({ pathname: '/(tabs)/chat/[farm]', params: { farm } }),
} as const;
