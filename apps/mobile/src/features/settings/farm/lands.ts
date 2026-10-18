import type { Season } from '@kithfield/contracts';

/**
 * The four lands a farm can stand on, as planting a new farm draws them: each is the farm strip in one
 * season's colours.
 */
export const LANDS = [
  { id: 'meadow', season: 'spring', label: 'settings.land.meadow' },
  { id: 'orchard', season: 'summer', label: 'settings.land.orchard' },
  { id: 'hollow', season: 'autumn', label: 'settings.land.hollow' },
  { id: 'hilltop', season: 'winter', label: 'settings.land.hilltop' },
] as const satisfies readonly { id: string; season: Season; label: string }[];
