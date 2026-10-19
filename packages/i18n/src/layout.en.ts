import type { EnCatalogue } from './catalogue-types';

/**
 * Larger screens (`14 Platforms`): farms and visits beside the chat on an iPad, the live farm in
 * its own column, and the large-screen farm with the chat floating at its side.
 */
export const layoutEn = {
  /* Farms and visits, the sidebar */
  'layout.sidebar.search': 'Search',
  'layout.sidebar.farms': 'Farms',
  'layout.sidebar.visits': 'Visits',
  /** The person's own line at the sidebar's foot, under their name. */
  'layout.sidebar.lampOn': 'lamp’s on',
  'layout.sidebar.hibernating': 'hibernating, cosy',
  'layout.sidebar.you': 'You and your settings',
  'layout.sidebar.somethingNew': 'something new',
  'layout.sidebar.empty': 'No farms yet. Plant one from the farm.',

  /* The chat in a pane */
  'layout.chat.noticeboard': 'The noticeboard',
  'layout.chat.seedBed': 'Seed bed',
  'layout.chat.more': 'Shared on the farm',
  'layout.chat.back': 'Farms and visits',
  /** The floating chat's title opens it beside farms and visits. */
  'layout.chat.openBeside': 'Open beside farms and visits',
  'layout.chat.open': 'Open the chat',

  /* The live farm */
  'layout.farm.open': 'Open the farm full screen',
  /** The note at the live farm's foot while a friend's critter holds up their words. */
  'layout.farm.reacts': 'The farm reacts as you chat: {name} just held up “{text}”.',

  /* The large-screen farm */
  'layout.farm.seedBed': 'Seed bed',
  'layout.farm.firefly': 'Leave a firefly',
  'layout.farm.fire': 'Sit by the fire',
} as const satisfies EnCatalogue;
