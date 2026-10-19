import type { EnCatalogue } from './catalogue-types';

/**
 * Store and launch art: the words painted into the store screenshots, the iPad set, the Play
 * feature graphic and the App Preview captions where `13 Launch` gives them only in English. Each
 * English string is exactly the board's text, which is how the baker finds it; the Vietnamese is
 * adapted, not translated, like the board's own Vietnamese set.
 */
export const launchEn = {
  'launch.preview.stayClose': 'Stay close to your people.',
  'launch.preview.firefly': 'Leave a firefly on a doorstep.',
  'launch.preview.dewdrop': 'A dewdrop grows a sprout.',
  'launch.preview.campfire': 'Plans sprout into a campfire.',
  'launch.preview.gathers': 'Everyone gathers.',
  'launch.preview.homeScreen': 'Your friends, on your home screen.',
  'launch.play.tagline': 'stay close. no texting guilt.',
  'launch.ipad.bookClub': 'Book club',
  'launch.ipad.family': 'Family',
  'launch.ipad.uniLot': 'Uni lot',
  'launch.ipad.picnicAsk': 'picnic by the river? I’ll bring the good crisps',
  'launch.ipad.picnicYes': 'yes!! planting it as a seed',
  'launch.ipad.picnicWhen': 'Sat 24 Oct · Willow bend · it sprouted!',
  'launch.ipad.dinner': 'Bea’s birthday dinner',
  'launch.ipad.dinnerWhen': 'Fri 6 Nov · waiting on a few yeses',
  'launch.ipad.games': 'Board games at Mo’s',
  'launch.ipad.gamesWhen': 'Has a place, needs a day',
} as const satisfies EnCatalogue;
