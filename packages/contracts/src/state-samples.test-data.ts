import { at, bea, critter, farm, fig, pip } from './samples.test-data';

/* Snapshot samples for the contract tests. */

const plant = (id: string, stage: number) => ({
  plant: id,
  stage,
  dew: stage * 4,
  rare: null,
  bloomedAt: stage >= 3 ? at - 86_400_000 : null,
  credits: [{ person: bea, kinds: ['voice', 'fire'] }],
});

const member = (person: string, role: 'keeper' | 'helper' | 'critter') => ({
  person,
  name: person.slice(2),
  critter,
  role,
  joinedAt: at - 90 * 86_400_000,
  lastOpenedAt: at - 3_600_000,
  lastTendedAt: null,
  hibernating: false,
  pausedUntil: null,
  activeThisSeason: true,
  birthday: null,
  status: null,
  cloudAt: null,
  battery: 'open',
});

/** A farm in autumn: six family plants, the signature crop, a plan and a pin. */
export const farmState = {
  farm,
  kind: 'farm',
  name: 'The Thursday Lot',
  land: 'meadow',
  theme: null,
  timeZone: 'Europe/London',
  hemisphere: 'north',
  place: {
    city: 'London',
    country: 'GB',
    lat: 51.5,
    lng: -0.1,
  },
  birthdaysBloom: true,
  approval: false,
  frozen: false,
  rulesVersion: 1,
  season: { season: 'autumn', year: 2026 },
  weather: { day: '2026-10-18', weather: 'rain' },
  sharedRainDay: null,
  members: [member(bea, 'keeper'), member(pip, 'keeper'), member(fig, 'critter')],
  former: [{ person: 'p_old', name: null, critter, leftAt: at - 1000, how: 'account_deleted' }],
  plants: [
    plant('marigold', 1),
    plant('aster', 2),
    plant('chrysanthemum', 0),
    plant('heather', 3),
    plant('apple', 4),
    plant('pumpkin', 2),
    plant('plum', 1),
  ],
  signature: 'plum',
  familyTendedAt: {
    dew: at,
    words: at,
    pictures: null,
    voices: at - 1000,
    gestures: null,
    gatherings: at,
  },
  today: { day: '2026-10-18', given: [{ person: bea, plant: 'heather', dew: 3 }] },
  roses: [{ person: bea, day: '2026-10-18', waterers: [pip], signers: [pip, fig] }],
  pot: null,
  fieldGuide: [
    {
      plant: 'heather',
      variant: 'rain_kissed',
      season: { season: 'autumn', year: 2026 },
      foundAt: at,
      via: 'grown',
    },
  ],
  basket: null,
  seeds: [
    {
      seq: 20,
      planter: pip,
      title: 'Picnic by the river',
      days: [{ date: '2026-10-24', from: '16:00' }],
      place: { name: 'Willow bend' },
      yeses: 'most',
      someday: false,
      hat: pip,
      settleOn: null,
      votes: [{ option: 0, people: [bea, pip] }],
      rsvps: [{ person: fig, answer: 'maybe' }],
      checkins: [],
      sproutedAt: null,
    },
  ],
  pins: [14],
  doorstep: [
    { seq: 30, kind: 'firefly', from: pip, to: fig },
    { seq: 31, kind: 'slow_post', from: bea, to: pip, deliverAt: at + 3_600_000 },
  ],
  fireLitAt: null,
};

/** A visit: two people, a porch pot and its pressed blooms, no field. */
export const visitState = {
  ...farmState,
  farm: 'f_visit_june_otis',
  kind: 'visit',
  name: null,
  members: [member(bea, 'critter'), member('p_otis', 'critter')],
  former: [],
  plants: [],
  signature: null,
  seeds: [],
  pins: [],
  doorstep: [],
  fieldGuide: [],
  today: { day: '2026-10-18', given: [] },
  pot: {
    ...plant('cosmos', 2),
    pressed: [
      { season: { season: 'summer', year: 2026 }, plant: 'nasturtium', pressedAt: at - 9e9 },
    ],
  },
};
